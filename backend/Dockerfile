FROM python:3.9-slim

WORKDIR /app

# Install uv
RUN pip install uv

# Copy project definition
COPY backend/pyproject.toml .

# Install dependencies system-wide
RUN uv pip install --system .

# Copy backend code
COPY backend/ .

# Copy frontend code to static directory
COPY frontend/ static/

# Expose port
EXPOSE 19563

# Run
CMD ["python", "main.py"]
