FROM node:20-alpine

RUN npm install -g @musistudio/claude-code-router

EXPOSE 3456

CMD ["ccr",  "start"]
