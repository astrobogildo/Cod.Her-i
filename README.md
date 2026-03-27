# Código: Herói — Sistema de RPG Digital v2.0

Ferramenta web para jogar **Código: Herói** em rede local. Jogadores conectam pelo navegador, criam personagens, entram em mesas e jogam com dados digitais, fichas interativas e ferramentas do mestre.

## Requisitos

| Software | Versão mínima | Download |
|----------|--------------|----------|
| Python   | 3.11+        | [python.org](https://www.python.org/downloads/) |
| Node.js  | 18+          | [nodejs.org](https://nodejs.org/) |
| Git      | (opcional)   | [git-scm.com](https://git-scm.com/) |

## Como Usar

### Windows
```
1. Clique duas vezes em CodigoHeroi.bat
2. Pronto.
```

O script faz tudo automaticamente:
- Detecta Python e Node.js (instala se necessário via winget/download)
- Cria ambiente virtual e instala dependências do backend
- Instala dependências do frontend
- Inicia os servidores
- Abre o navegador

Na segunda vez que executar, pula direto para iniciar os servidores.

### Manual (Linux/Mac)
```bash
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
cd frontend && npm install && cd ..

# Em terminais separados:
.venv/bin/python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
cd frontend && npm run dev -- --host
```

### Solução de Problemas

| Problema | Solução |
|----------|---------|
| "Python não encontrado" | Instale Python e marque **"Add Python to PATH"** |
| "Node.js não encontrado" | Instale Node.js 18+ de nodejs.org |
| Porta 8000 ocupada | Feche outros servidores ou reinicie o PC |
| Quer parar os servidores | Pressione qualquer tecla na janela principal |

## Acesso na Rede Local

O mestre inicia o servidor e os jogadores acessam pelo IP da máquina:
```
http://IP_DO_MESTRE:5173
```

## Estrutura do Projeto

```
codigo-heroi/
├── backend/           # API Python (FastAPI + SQLAlchemy + SQLite)
│   ├── api/           # Endpoints REST
│   ├── auth/          # JWT + bcrypt
│   ├── db/            # Banco de dados
│   ├── engine/        # Motor de regras (dados, cálculos, poderes)
│   ├── models/        # Modelos ORM
│   ├── ws/            # WebSocket hub
│   └── main.py        # Entry point
├── frontend/          # Interface React + TypeScript + Tailwind
│   └── src/
│       ├── pages/     # Páginas (Login, Dashboard, Personagens, Ficha)
│       ├── components/# Componentes (PowerForge)
│       ├── context/   # Estado global (Auth, Catálogo)
│       └── api.ts     # Cliente API tipado
├── CodigoHeroi.bat    # Clique duplo: instala tudo e inicia
└── README.md
```

## Tecnologias

- **Backend**: FastAPI, SQLAlchemy (async), SQLite, WebSocket
- **Frontend**: React 19, TypeScript, Tailwind CSS, Vite
- **Auth**: JWT + bcrypt
- **Real-time**: WebSocket nativo
