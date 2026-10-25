const mongoose = require('mongoose');
const { AppError } = require('../middleware/errorHandler');

/** Escapes user input before it is placed inside a RegExp (prevents regex injection / ReDoS). */
function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Accepts only plain strings. Rejecting objects and arrays blocks NoSQL operator
 * injection such as { "$ne": null } sneaking into a query or an update.
 */
function requireString(value, field, { max = 200, min = 1, optional = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (optional) return undefined;
    throw new AppError(`${field} is required.`, 400);
  }
  if (typeof value !== 'string') throw new AppError(`${field} must be text.`, 400);
  const trimmed = value.trim();
  if (trimmed.length < min) throw new AppError(`${field} is required.`, 400);
  if (trimmed.length > max) throw new AppError(`${field} must be at most ${max} characters.`, 400);
  return trimmed;
}

function optionalString(value, field, max = 500) {
  if (value === undefined || value === null) return undefined;
  return requireString(value, field, { max, min: 0, optional: true }) ?? '';
}

function requireObjectId(value, field) {
  if (typeof value !== 'string' || !mongoose.Types.ObjectId.isValid(value) || !/^[0-9a-fA-F]{24}$/.test(value)) {
    throw new AppError(`${field} is not a valid identifier.`, 400);
  }
  return value;
}

function optionalObjectId(value, field) {
  if (value === undefined || value === null || value === '') return null;
  return requireObjectId(value, field);
}

function requireEnum(value, allowed, field) {
  if (!allowed.includes(value)) throw new AppError(`${field} must be one of: ${allowed.join(', ')}.`, 400);
  return value;
}

function clampInt(value, { min, max, fallback }) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

const DPP_ID_PATTERN = /^DPP-[A-Za-z0-9._-]{1,120}$/;

module.exports = {
  escapeRegex,
  requireString,
  optionalString,
  requireObjectId,
  optionalObjectId,
  requireEnum,
  clampInt,
  DPP_ID_PATTERN,
};
