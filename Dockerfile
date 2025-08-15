FROM node:22-slim

WORKDIR /app

COPY package.json ./

RUN npm install

COPY /src ./src
COPY /keys ./keys
COPY tsconfig.json ./

RUN npm run build

ARG NODE_ENV
ENV NODE_ENV=${NODE_ENV}

EXPOSE ${PORT}

CMD ["sh", "-c", "if [ \"$NODE_ENV\" = \"production\" ]; then node build/server.js; else npx nodemon -r tsconfig-paths/register --exec ts-node ./src/server.ts --files; fi"]