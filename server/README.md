# ZOD Chat Server

Servidor de chat global para o DApp ZOD Mining.

**Configuração:**
- Domínio: https://unionzod.com/zpm/
- IP VPS: 158.69.20.2
- Porta: 3010

## Instalação

```bash
cd server
npm install
```

## Executar manualmente

```bash
npm start
```

O servidor roda na porta 3010 por padrão.

## Configurar como serviço systemd (Ubuntu VPS)

1. Crie o arquivo de serviço:

```bash
sudo nano /etc/systemd/system/zod-chat.service
```

2. Cole o seguinte conteúdo:

```ini
[Unit]
Description=ZOD Chat Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/home/user/chat-server
ExecStart=/usr/bin/node chat-server.js
Restart=on-failure
RestartSec=10
Environment=NODE_ENV=production
Environment=CHAT_PORT=3010

[Install]
WantedBy=multi-user.target
```

3. Ative e inicie o serviço:

```bash
sudo systemctl daemon-reload
sudo systemctl enable zod-chat
sudo systemctl start zod-chat
```

4. Verifique o status:

```bash
sudo systemctl status zod-chat
```

5. Ver logs:

```bash
sudo journalctl -u zod-chat -f
```

## Liberar porta no firewall

```bash
sudo ufw allow 3010/tcp
```

## Configurar Nginx com SSL (Recomendado)

Para usar HTTPS com o chat, configure o Nginx como proxy:

```nginx
# Adicionar no bloco server do unionzod.com (com SSL)

location /chat-socket/ {
    proxy_pass http://127.0.0.1:3010/socket.io/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

location /chat-api/ {
    proxy_pass http://127.0.0.1:3010/api/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Depois recarregue o Nginx:
```bash
sudo nginx -t && sudo systemctl reload nginx
```

## Alternativa: Conexão direta pela porta 3010

Se preferir conectar diretamente (sem proxy Nginx), libere a porta:
```bash
sudo ufw allow 3010/tcp
```

E use a URL: `https://unionzod.com:3010` ou `http://158.69.20.2:3010`
