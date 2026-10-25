# Role permission matrix

Generated from `server/services/access/permissions.js`. Changing a role needs a code change there, and this file must be regenerated with it.

| Permission | ADMIN | MANAGER | EMPLOYEE | AUDITOR |
| --- | --- | --- | --- | --- |
| `assets:read` | yes | yes | yes | yes |
| `assets:write` | yes | no | no | no |
| `lifecycle:read` | yes | yes | yes | yes |
| `lifecycle:allocate` | yes | yes | no | no |
| `lifecycle:dispose` | yes | no | no | no |
| `qr:issue` | yes | yes | no | no |
| `integrity:verify` | yes | yes | no | yes |
| `integrity:full-chain` | yes | no | no | yes |
| `reports:scoped` | yes | yes | no | yes |
| `reports:global` | yes | no | no | yes |
| `audit:read` | yes | no | no | yes |
| `users:manage` | yes | no | no | no |
| `users:assignable` | yes | yes | no | no |
| `departments:read` | yes | yes | no | yes |
| `departments:manage` | yes | no | no | no |
| `profile:read` | yes | yes | yes | yes |
| `profile:write` | yes | yes | yes | yes |

## Notes for the bulk features

- **Import** needs `assets:write`: ADMIN only.
- **Export** needs `assets:read`: every role, limited to that role's data scope.
- **Demo accounts** are created with the roles above. Managers are scoped to their managed departments. Employees see assets assigned to them or in their department (see `services/access/scope.js`).
