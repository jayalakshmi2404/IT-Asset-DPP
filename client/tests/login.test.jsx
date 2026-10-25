import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const auth = { user: null, loading: false, login: vi.fn() };
vi.mock('../src/context/AuthContext', () => ({ useAuth: () => auth }));

import Login from '../src/pages/Login';

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Login />
    </MemoryRouter>
  );
}

describe('Login page', () => {
  beforeEach(() => {
    auth.user = null;
    auth.loading = false;
    auth.login = vi.fn();
    sessionStorage.clear();
  });

  it('renders the real form with accessible labels and no SSO button', () => {
    renderLogin();
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    expect(screen.queryByText(/single sign-on|sso|google|microsoft/i)).not.toBeInTheDocument();
  });

  it('does not call the API when fields are empty', async () => {
    renderLogin();
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(auth.login).not.toHaveBeenCalled();
  });

  it('shows the server message when credentials are rejected', async () => {
    auth.login = vi.fn().mockResolvedValue({ success: false, message: 'Invalid email or password.' });
    renderLogin();
    await userEvent.type(screen.getByLabelText(/email address/i), 'admin@example.test');
    await userEvent.type(screen.getByLabelText(/^password/i), 'wrong-password');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password.');
  });

  it('signs in with "keep me signed in" off by default', async () => {
    auth.login = vi.fn().mockResolvedValue({ success: true });
    renderLogin();
    await userEvent.type(screen.getByLabelText(/email address/i), 'admin@example.test');
    await userEvent.type(screen.getByLabelText(/^password/i), 'Correct-Horse-9');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => expect(auth.login).toHaveBeenCalledWith('admin@example.test', 'Correct-Horse-9', false));
  });

  it('toggles password visibility and reports the pressed state', async () => {
    renderLogin();
    const input = screen.getByLabelText(/^password/i);
    const toggle = screen.getByRole('button', { name: /show password/i });
    expect(input).toHaveAttribute('type', 'password');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(toggle);
    expect(input).toHaveAttribute('type', 'text');
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
  });

  it('explains password reset honestly instead of pretending it exists', async () => {
    renderLogin();
    await userEvent.click(screen.getByRole('button', { name: /forgot password/i }));
    expect(screen.getByText(/IT administrator/i)).toBeInTheDocument();
  });
});
