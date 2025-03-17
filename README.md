# Monorepo for Full-Stack Projects with NX and Docker

[![Architecture Diagram](./architecture.svg)](./architecture.svg)

This monorepo provides a structured and scalable foundation for developing and deploying multiple full-stack applications using NX, Docker, and a suite of modern technologies.  It is designed to promote code sharing, consistent development workflows, and streamlined deployments to VPS environments.

## Overview

This monorepo embraces a monorepo approach, managing multiple related projects within a single repository.  It leverages NX for build orchestration, dependency management, and code generation, and Docker for containerization and consistent environment setup across development, staging, and production.

**Key Features:**

*   **Multi-Project Support:**  Designed to host multiple independent full-stack projects (e.g., web applications, APIs, microservices, WordPress sites) within a single codebase.
*   **NX Workspace:**  Utilizes NX workspace features for efficient build processes, code sharing through libraries, and code generation.
*   **Dockerized Environments:** Employs Docker and Docker Compose for consistent development, staging, and production environments, ensuring reproducibility and simplifying deployment.
*   **Worker Framework:** Includes a robust `worker-framework` library for building asynchronous, queue-based background services (e.g., email sending, data scraping, reporting).
*   **Centralized Monitoring:**  Features a dedicated `monitor` application for deploying Grafana, Prometheus, and other monitoring tools on each VPS to observe application health and performance.
*   **VPS Deployment Focused:**  Architecture tailored for deployment to Virtual Private Servers (VPS), using Docker Compose for orchestration and Nginx as a central reverse proxy.
*   **Environment Separation:** Clearly defined environments for development (`dev`), staging (`stage`), and production (`prod`), each with dedicated Docker Compose configurations and settings.
*   **WordPress Integration:**  Supports hosting WordPress sites as part of the monorepo, alongside other application types, utilizing MySQL/MariaDB for WordPress databases.
*   **Automated SSL with Let's Encrypt:**  Integration with Certbot for automatic SSL certificate generation and renewal for all domains managed by Nginx.
*   **PgBouncer Connection Pooling:**  Utilizes PgBouncer as a connection pooler for PostgreSQL to optimize database connection management and performance for projects using PostgreSQL.

## Directory Structure

```
apps/
├── project-1/
│   ├── apollo-prisma/
│   ├── web-react/
│   ├── worker-email/
│   ├── docker-compose.dev.yml
│   └── docker-compose.prod.yml
├── project-2/
│   └── ...
├── project-3/
│   └── ...
├── monitor/
│   └── docker-compose.monitor.yml
└── wordpress-project-1/
    └── docker-compose.yml
libs/
└── worker-framework/
    └── src/
tools/
└── create-worker/
    └── src/
vps-config/
├── vps1/
│   └── nginx/
└── vps2/
    └── nginx/
docs/
└── nginx-configuration.md
package.json
nx.json
README.md
```

## Environments

This monorepo is designed around distinct environments to support the software development lifecycle:

*   **`dev` (Development):**  Local development environment on developer machines.  Utilizes Docker Compose (e.g., `docker-compose.dev.yml`) for a consistent and isolated development setup. Focus is on rapid iteration and debugging.
*   **`stage` (Staging):**  Pre-production environment deployed on a VPS, mirroring production as closely as possible. Used for integration testing, user acceptance testing (UAT), and final validation before production release.  Uses `docker-compose.stage.yml` and a dedicated staging subdomain.
*   **`prod` (Production):**  Live production environment deployed on VPS, serving end-users.  Utilizes `docker-compose.prod.yml` for optimized performance and stability.  Accessed via the main domain.
*   **`monitor` (Monitoring):**  A dedicated environment, deployed on each VPS, for running monitoring tools (Grafana, Prometheus, etc.) via the `monitor` application. Provides insights into all environments running on that VPS.

## Deployment Overview

Deployment to VPS environments is primarily managed using Docker Compose and a CI/CD pipeline (to be further defined).  The general deployment process involves:

1.  **Building Docker Images:**  CI/CD pipeline builds Docker images for each application and service within the monorepo upon code changes.
2.  **Pushing Images to Registry:**  Docker images are pushed to a container registry (e.g., Docker Hub, GitHub Container Registry).
3.  **SSH to VPS:**  CI/CD pipeline connects to the target VPS via SSH.
4.  **Pulling Docker Images:**  New Docker images are pulled from the container registry onto the VPS.
5.  **Docker Compose Up:**  Docker Compose is used to update and restart the application stack on the VPS, using the appropriate `docker-compose.prod.yml` or `docker-compose.stage.yml` configuration.
6.  **Database Migrations:**  Database migrations (e.g., Prisma migrations for PostgreSQL projects) are executed as part of the deployment process to keep the database schema up-to-date. WordPress database migrations are handled through WordPress-specific mechanisms.
7.  **Nginx Configuration Update:**  Nginx configuration is updated (if necessary) to reflect changes in domain routing or application endpoints.
8.  **Monitoring Deployment:**  The `monitor` application is deployed and configured on each VPS to provide ongoing monitoring.

## Key Technologies

*   **NX:**  Build system, monorepo management, code generation.
*   **Docker & Docker Compose:**  Containerization, environment orchestration.
*   **TypeScript:**  Primary programming language.
*   **React:**  Frontend web application framework.
*   **React Native (Optional):**  Mobile application framework (for some projects).
*   **Apollo Server & GraphQL:**  Backend API framework for PostgreSQL-based projects.
*   **Prisma:**  ORM (Object-Relational Mapper) for PostgreSQL database access.
*   **PostgreSQL:**  Primary relational database system for most projects.
*   **PgBouncer:** PostgreSQL connection pooler.
*   **MySQL/MariaDB:** Relational database system specifically for WordPress projects.
*   **RabbitMQ:**  Message broker for asynchronous task processing.
*   **Nginx:**  Reverse proxy, web server, load balancer.
*   **Grafana & Prometheus:**  Monitoring and visualization tools.
*   **Certbot (Let's Encrypt):**  SSL certificate management.
*   **Node.js:**  Runtime environment for backend services and tooling.

## Documentation Index

*   **Worker Framework:** [libs/worker-framework/README.md](./libs/worker-framework/README.md)
*   **Nginx Configuration:** [docs/nginx-configuration.md](./docs/nginx-configuration.md)
*   **[Project Documentation - To be added per project]** (e.g., [apps/project-1/README.md](./apps/project-1/README.md), [apps/project-2/README.md](./apps/project-2/README.md))
*   **[Monitor Application Documentation - To be added]** (e.g., [apps/monitor/README.md](./apps/monitor/README.md))
*   **VPS Configuration (`vps-config/`):** [See section below](#vps-configuration-vps-config)

## VPS Configuration (`vps-config/`)

The `vps-config/` directory at the root of the monorepo is dedicated to storing VPS-specific configurations for various services and applications deployed on the VPS. This separation ensures that VPS-level settings are kept distinct from the application code managed within the `apps/` and `libs/` directories, promoting cleaner configuration management and environment-specific adjustments.

**Structure of `vps-config/`:**

The `vps-config/` directory is organized primarily by VPS server. Each VPS server intended to be configured and managed has its own subdirectory (e.g., `vps1`, `vps2`, etc.). Within each VPS subdirectory, you'll find configurations related to different services running on that VPS:

```
vps-config/
├── vps1/                             # Configuration for VPS Server 1
│   ├── nginx/                        # Nginx configuration files for VPS 1 (reverse proxy, SSL, etc.)
│   │   ├── nginx.conf                # Main Nginx configuration for vps1
│   │   ├── sites-available/          # Virtual host configurations for domains/subdomains on vps1
│   │   │   ├── project-1.com.conf
│   │   │   ├── project-2.com.conf
│   │   │   ├── stage.project-1.com.conf
│   │   │   └── ...
│   │   └── certbot/                  # Certbot scripts/config for SSL certificate management on vps1
│   │       ├── renew-certificates.sh
│   │       └── ...
│   ├── postgresql/                   # PostgreSQL configuration for VPS 1 (if self-managed)
│   │   ├── docker-compose.yml        # Docker Compose file to deploy PostgreSQL on VPS 1
│   │   ├── postgresql.conf           # PostgreSQL server configuration overrides (optional)
│   │   └── pg_hba.conf               # PostgreSQL client authentication configuration (optional)
│   ├── pgbouncer/                    # PgBouncer configuration for VPS 1
│   │   ├── docker-compose.yml        # Docker Compose file to deploy PgBouncer on VPS 1
│   │   └── pgbouncer.ini             # PgBouncer configuration file
│   ├── mysql/                        # MySQL/MariaDB configuration for WordPress on VPS 1 (if self-managed)
│   │   ├── docker-compose.yml        # Docker Compose file for MySQL/MariaDB
│   │   ├── my.cnf                    # MySQL server configuration overrides (optional)
│   │   └── ...                       # Other MySQL configuration files if needed
│   ├── rabbitmq/                     # RabbitMQ configuration for VPS 1 (if self-managed)
│   │   ├── docker-compose.yml        # Docker Compose file for RabbitMQ
│   │   └── rabbitmq.conf             # RabbitMQ configuration file (optional)
│   ├── monitor/                      # Monitor application specific configuration for VPS 1 (if needed)
│   │   └── .env.monitor.vps1         # Example: .env variables for monitor app on VPS 1
│   └── wordpress/                    # WordPress specific VPS-level configurations (if needed)
│       └── ...
├── vps2/                             # Configuration for VPS Server 2
│   └── ...                           # Similar structure for VPS 2
└── ...                               # Configurations for other VPS servers
