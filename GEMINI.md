# Project Overview

This project is a web application that displays the current time, a persistent todo list, and weather information. It consists of a static frontend (HTML/CSS/JS) and a Python backend (FastAPI) that manages data persistence and proxies external API calls.

## Key Features

*   **Live Clock:** Displays the current time and date, updated every second.
*   **Todo List:** A persistent todo list stored in a SQLite database via a REST API.
*   **Weather Display:** Shows the current weather conditions based on the user's geolocation, proxied through the backend to protect API keys.
*   **Pop-up Calendar:** Interactive monthly calendar view, accessible by clicking the time or date display.

# Deployment

The application is containerized using Docker and orchestrated with Docker Compose.

## Prerequisites

*   Docker Desktop (or Docker Engine + Docker Compose)

## Running the Application

1.  **Configure Environment:**
    Ensure `backend/.env` exists and contains your OpenWeatherMap API key:
    ```env
    OPENWEATHER_API_KEY=your_api_key_here
    ```

2.  **Configure Settings (Optional):**
    Modify `backend/config.yaml` to change the listening port (default: 19563):
    ```yaml
    port: 19563
    ```

3.  **Start the Service:**
    Run the following command in the project root:
    ```bash
    docker-compose up --build
    ```

4.  **Access:**
    Open your browser and navigate to: `http://localhost:19563` (or the port you configured).

# Configuration

*   **API Key:** Managed in `backend/.env`. This file is git-ignored for security.
*   **Server Port:** Managed in `backend/config.yaml`.

# Development Conventions

*   **Architecture:**
    *   `frontend/`: Static assets (HTML, JS, CSS). served by the backend.
    *   `backend/`: Python FastAPI application using `uv` for dependency management.
*   **Data Persistence:** Uses `SQLModel` (SQLAlchemy) with SQLite (`backend/database.db`).
*   **Styling:** Tailwind CSS (via CDN).
*   **JavaScript:**
    *   `todo.js`: Interacts with `/api/todos`.
    *   `updateFeatures.js`: Interacts with `/api/weather`.
*   **Dependencies:**
    *   Backend dependencies are defined in `backend/pyproject.toml`.
    *   Managed by `uv`.

# Troubleshooting

## Common Issues

### Database Error: `sqlite3.OperationalError: unable to open database file`

**Symptoms:**
*   Container fails to start or exits immediately.
*   Logs show `sqlite3.OperationalError: unable to open database file`.
*   `backend/database.db` exists as a directory instead of a file.

**Cause:**
Docker Compose may create a directory for the volume mount if the source file does not exist on the host machine before the container starts.

**Solution:**
1.  Remove the directory:
    ```bash
    rm -rf backend/database.db
    ```
2.  Create an empty file:
    ```bash
    touch backend/database.db
    ```
3.  Restart the container:
    ```bash
    docker-compose up -d --force-recreate
    ```
