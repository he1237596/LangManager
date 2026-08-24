FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY index.mjs ./
EXPOSE 8081
CMD ["node", "index.mjs"]
