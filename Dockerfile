FROM python:3
WORKDIR /app
ARG POETRY_VERSION=1.2.2
RUN apt-get update && \
    curl -sL https://deb.nodesource.com/setup_18.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/cache/apk/* && \
    pip3 install --no-cache-dir poetry && \
    rm -rf ~/.cache/
RUN echo "Node: " && node -v
RUN echo "NPM: " && npm -v
COPY package*.json ./
COPY pyproject.toml ./
COPY poetry.lock ./
# Install dependencies
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
RUN poetry install && npm install && rm -rf ~/.npm/
COPY . .
CMD ["npm", "run", "dev"]
