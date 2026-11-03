FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Railway pasa las variables como build args; Vite las incorpora en build time.
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

EXPOSE 5173

# En desarrollo docker-compose pisa este CMD con `npm run dev -- --host`.
CMD ["sh", "-c", "npm run build && npm run preview -- --host 0.0.0.0 --port ${PORT:-5173}"]