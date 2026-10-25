const mongoose = require('mongoose');

const ROLES = ['ADMIN', 'MANAGER', 'EMPLOYEE', 'AUDITOR'];

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, required: true, default: 'EMPLOYEE' },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },

    // Stable reference to the user's department. `department` is a denormalized
    // display name kept in sync by the server; it is never used for authorization.
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null, index: true },
    department: { type: String, trim: true, default: '' },

    // Departments a MANAGER is explicitly authorized to see. Empty = no scope.
    managedDepartmentIds: { type: [mongoose.Schema.Types.ObjectId], ref: 'Department', default: [] },

    // Incremented on logout, password change, role/status change. Any token
    // carrying an older version is rejected on the next request.
    tokenVersion: { type: Number, default: 0 },
    lastLoginAt: { type: Date },
  },
  { timestamps: true }
);

userSchema.index({ role: 1 });

module.exports = mongoose.model('User', userSchema);
module.exports.ROLES = ROLES;
