# Stage 1: Build the application
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package.json and package-lock.json (or yarn.lock)
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Build TypeScript code
RUN npm run build

# Copy markdown files to public directory in builder so they are included with 'COPY --from=builder /app/public ./public'
COPY questions.md /app/public/questions.md
COPY system_message.md /app/public/system_message.md

# Stage 2: Production image
FROM node:18-alpine

WORKDIR /app

# Copy built application from builder stage
# /app/dist does not exist in builder, compiled output is in /app/public/dist
# This line is removed because /app/public (copied next) includes /app/public/dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/public ./public
COPY --from=builder /app/system_message.md ./system_message.md

EXPOSE 3000

CMD ["npm", "start"]
