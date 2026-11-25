FROM node:24-alpine
WORKDIR /app
COPY package.json server.js sorteio.js ./
COPY public ./public
COPY demo ./demo
RUN mkdir /dados /chave && chown node:node /dados /chave && chmod 700 /dados /chave
USER node
ENV DADOS=/dados CHAVE=/chave/mestra.key PORT=2512
EXPOSE 2512
CMD ["node", "server.js"]
