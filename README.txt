# Sync Service API

A robust NodeJS Express API service for managing client database synchronization operations and user authentication.

## Overview

This service provides a centralized API for client applications to synchronize data with the main server database. It includes user management, authentication, logging, and data synchronization capabilities.

## Features

- **Admin Panel Backend API**
  - User management (create, read, update, delete)
  - Admin authentication with JWT
  - Session management

- **Synchronization API**
  - Secure data synchronization
  - Client authentication via tokens
  - Transaction support for data integrity

- **Security**
  - JWT-based authentication
  - HTTP-only cookies
  - Rate limiting
  - Secure headers with Helmet
  - CORS protection

- **Logging**
  - Comprehensive Winston-based logging
  - Error tracking
  - Operation auditing

## Prerequisites

- Node.js (v14+)
- PostgreSQL database
- npm or yarn

## Installation

1. **Clone the repository**

```bash
git clone <your-repository-url>
cd sync-service-api
```

2. **Install dependencies**

```bash
npm install
```

3. **Configure environment variables**

Create a `.env` file in the root directory with the following variables:

```
# Server Configuration
PORT=5005
NODE_ENV=development
API_URL=http://localhost:5005
FRONTEND_ORIGIN=http://localhost:5173

# PostgreSQL Configuration
PG_HOST=localhost
PG_PORT=5432
PG_DATABASE=your_database_name
PG_USER=your_database_user
PG_PASSWORD=your_database_password

# Authentication
JWT_SECRET=your_jwt_secret_key
JWT_EXPIRES_IN=10d
COOKIE_NAME=superadmin_token

# Logging
LOG_LEVEL=info
```

> **Note**: Replace placeholder values with your actual configuration details

## Database Initialization

The API includes a route to initialize the required database tables. After configuring your PostgreSQL connection, run:

```bash
curl -X GET http://localhost:5005/api/admin/initialize
```

Alternatively, use the route in a browser or API testing tool.

## Project Structure

```
sync-service-api/
├── routes/
│   ├── admin.js         # Admin panel routes
│   └── syncApi.js       # Synchronization endpoints
├── middleware/
│   └── auth.js          # Authentication middleware
├── services/
│   └── dbService.js     # Database connection services
├── utils/
│   └── logger.js        # Winston logger configuration
├── logs/                # Log files directory
├── .env                 # Environment variables
├── server.js            # Application entry point
└── package.json         # Project dependencies
```

## API Endpoints

### Admin Routes

- `GET /api/admin/initialize` - Initialize database tables
- `POST /api/admin/login` - Admin login
- `POST /api/admin/logout` - Admin logout
- `GET /api/admin/me` - Check admin session
- `GET /api/admin/list-users` - List all sync users
- `POST /api/admin/add-users` - Create a new sync user
- `PUT /api/admin/update-users/:clientId` - Update user details
- `DELETE /api/admin/delete-users/:clientId` - Delete a user
- `GET /api/admin/users/:clientId/config` - Get user-specific configuration
- `GET /api/admin/logs` - Fetch synchronization logs

### Sync API Routes

- `POST /api/sync/data` - Synchronize client data
- `POST /api/sync/log` - Log sync operation details

## Usage

### Starting the Server

```bash
npm start
```

For development with automatic restart:

```bash
npm run dev
```

### Client Configuration

When setting up a new client:

1. Create a user through the admin panel
2. Generate client configuration with the `/api/admin/users/:clientId/config` endpoint
3. Provide the client with their unique client ID and access token

### Data Synchronization

Clients should post data in the following format:

```json
{
  "clientId": "client_identifier",
  "accessToken": "access_token",
  "data": [
    {
      "CODE": "value",
      "NAME": "value",
      "ADDRESS": "value",
      "PLACE": "value",
      "SUPER_CODE": "value"
    },
    {
      "ID": "user_id",
      "PASS": "user_password"
    }
  ]
}
```

## Security Considerations

- Always use HTTPS in production
- Regularly rotate JWT secrets and access tokens
- Store passwords securely (consider implementing password hashing)
- Implement proper input validation and sanitization

## Production Deployment

For production deployment:

1. Set `NODE_ENV=production` in your environment
2. Configure a production-ready PostgreSQL database
3. Use a process manager like PM2
4. Set up a reverse proxy (Nginx/Apache) with SSL/TLS

Example PM2 configuration:

```bash
pm2 start server.js --name sync-service-api
```

## Custom Configurations

You can extend this service by:

1. Adding new routes in the routes directory
2. Implementing additional middleware for specialized requirements
3. Extending the database schema for more features

## Logging

Logs are stored in the `logs` directory with separate files for:
- `combined.log` - All logs of level 'info' and below
- `error.log` - Error-level logs only
- `admin.log` - Admin operations logging

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

[Your License] - See the LICENSE file for details.

---

*Customize this README according to your organization's specific requirements and guidelines.*