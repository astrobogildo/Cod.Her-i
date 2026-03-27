# Código: Herói — Sistema de RPG Digital v2.0

Ferramenta web para jogar **Código: Herói** em rede local. Jogadores conectam pelo navegador, criam personagens, entram em mesas e jogam com dados digitais, fichas interativas e ferramentas do mestre.

## Requisitos

| Software | Versão mínima | Download |
|----------|--------------|----------|
| Python   | 3.11+        | [python.org](https://www.python.org/downloads/) |
| Node.js  | 18+          | [nodejs.org](https://nodejs.org/) |
| Git      | (opcional)   | [git-scm.com](https://git-scm.com/) |

## Instalação Rápida

### Windows
```
1. Clone ou baixe este repositório
2. Execute: setup.bat
3. Execute: start.bat
4. Acesse: http://localhost:5173
```

### Manual (qualquer OS)
```bash
# Backend
python -m venv .venv
.venv/Scripts/pip install -r backend/requirements.txt   # Windows
# .venv/bin/pip install -r backend/requirements.txt      # Linux/Mac

# Frontend
cd frontend
npm install
cd ..

# Iniciar
.venv/Scripts/python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
cd frontend && npm run dev -- --host
```

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
│       ├── pages/     # Páginas (Login, Dashboard, Personagens)
│       ├── context/   # Estado global (Auth)
│       └── api.ts     # Cliente API tipado
├── setup.bat          # Instalador automático
├── start.bat          # Iniciar servidores
└── README.md
```

## Tecnologias

- **Backend**: FastAPI, SQLAlchemy (async), SQLite, WebSocket
- **Frontend**: React 19, TypeScript, Tailwind CSS, Vite
- **Auth**: JWT + bcrypt
- **Real-time**: WebSocket nativo
