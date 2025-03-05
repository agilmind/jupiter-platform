# Jupiter Platform

A Docker Compose and Nx-based microservices platform for building scalable applications.

## Overview

Jupiter Platform is a microservices architecture that combines the power of Docker Compose for containerization and Nx for monorepo management. It provides a framework for building robust, scalable, and maintainable services.

## Key Features

- **Microservices Architecture**: Loosely coupled services with clear boundaries
- **Worker Framework**: Standardized framework for building asynchronous processing services
- **Containerization**: Docker-ready services with optimized configurations
- **GraphQL API**: Central API for inter-service communication
- **Message Queues**: RabbitMQ for reliable service communication
- **Monorepo Management**: Nx for efficient workspace organization

## Quick Start

```bash
# Install dependencies
npm install

# Build all services
npm run build

# Start email service
npm run serve:email
```

## Documentation

- [Worker Framework Guide](docs/WORKER-FRAMEWORK.md) - How to use the Worker Framework for building processing services
- [Email Service Documentation](docs/EMAIL-SERVICE.md) - Documentation for the email service
- [Scraper Service Documentation](docs/SCRAPER-SERVICE.md) - Documentation for web scrapers

## Project Structure

```
jupiter-platform/
├── apps/                    # Application services
│   ├── email-service/       # Email sending service
│   └── scraper-services/    # Web scraping services
├── libs/                    # Shared libraries
│   ├── worker-framework/    # Core worker framework
│   └── shared-utils/        # Shared utilities
└── docker-compose.yml       # Docker Compose configuration
```

## Available Services

- **Email Service**: Handles email delivery with retry capabilities
- **Scraper Services**: Various web scrapers for data collection

## Contributing

1. Create a new branch for your feature
2. Make your changes
3. Submit a pull request

For adding new worker services, use the provided script:

```bash
npm run create-worker <worker-name> <domain>
```

## License

This project is licensed under the MIT License - see the LICENSE file for details.
