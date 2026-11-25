FROM node:24-alpine
WORKDIR /app
COPY package.json server.js sorteio.js ./
COPY public ./public
COPY demo ./demo
RUN mkdir /dados && chown node:node /dados
USER node
ENV DADOS=/dados PORT=2512
EXPOSE 2512
CMD ["node", "server.js"]
