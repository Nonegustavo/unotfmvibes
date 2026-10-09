# Servidor das salas online do unotfm (fase 3): leva só o servidor (servidor/) e a mesa (js/mesa/), que ele roda em
# cada sala. O site continua no GitHub Pages. Publicar: veja docs/plano-multiplayer.md, seção 9.4.
FROM node:22-alpine
WORKDIR /app
COPY servidor/package.json servidor/package-lock.json servidor/
RUN cd servidor && npm ci --omit=dev
COPY servidor/servidor.mjs servidor/
COPY js/mesa js/mesa
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "servidor/servidor.mjs"]
