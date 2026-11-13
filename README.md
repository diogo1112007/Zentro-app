# Foco v2

Tarefas, horário, hábitos, finanças, notas, avaliações (0–20) e flashcards, num só lugar. PWA (instala-se no telemóvel e funciona offline).

## Estrutura

```
index.html          markup
css/app.css         estilos (claro/escuro)
js/store.js         camada de dados: Firebase OU modo local (sem conta)
js/app.js           lógica da app
js/vendor/          Chart.js, DOMPurify, canvas-confetti (locais, sem CDN)
sw.js               service worker (offline)
manifest.json       PWA
firestore.rules     regras de segurança, PUBLICAR NO FIREBASE
icons/              ícones da app
```

## Pôr online (Firebase Hosting)

1. `npm i -g firebase-tools` → `firebase login` → `firebase init hosting` (pasta pública: esta pasta; SPA: não).
2. **Publica as regras**: Firebase Console → Firestore → Regras → cola `firestore.rules` → Publicar.
   Sem isto, qualquer pessoa com a `apiKey` (que é pública por natureza) pode ler os dados de todos os utilizadores.
3. Firebase Console → Authentication → Settings → **Domínios autorizados**: adiciona o teu domínio.
4. `firebase deploy`.

Para testar localmente: `npx serve .` (o service worker e o cofre precisam de `http://localhost` ou HTTPS; não abras o `index.html` com duplo clique).

Os nomes das coleções são os mesmos da v1, por isso os dados existentes continuam a funcionar.

## O que foi corrigido em relação à v1

**Bloqueadores**
- **A app não arrancava**: a função `copiarNota` tinha uma string partida em duas linhas, o que dava *SyntaxError* e impedia todo o JavaScript de correr.
- `iniciarModoEstudo`, as cores do horário e o botão de apagar orçamentos estavam fora do `window` e davam erro ao clicar.
- A secção **Horário não tinha botão** na navegação, por isso era impossível lá chegar.
- O `sw.js` e o `manifest.json` referidos no HTML não existiam.

**Dados e lógica**
- **Despesas recorrentes duplicavam-se exponencialmente**: cada mês copiava também as cópias e corria antes de os dados carregarem.
- **Tarefas recorrentes não faziam nada**. Agora, ao concluir uma, é criada a próxima (+7 dias ou +1 mês).
- **XP**: estava só no `localStorage` (perdia-se ao mudar de dispositivo) e dava para ganhar XP sem limite a marcar e desmarcar a mesma tarefa. Agora fica guardado na conta, o desmarcar anula o XP e tens um histórico.
- Penalizações: os intervalos multiplicavam-se a cada login. Agora há um único intervalo e as tarefas antigas não são castigadas todas de uma vez.
- Ganhos, gastos e orçamentos somavam **todo o histórico** em vez do mês atual.
- Os alertas de orçamento disparavam uma notificação a cada render. Agora é uma por mês e por categoria.
- A média geral misturava os pesos de disciplinas diferentes. Agora é ponderada por ECTS, e cada disciplina mostra **quanto precisas no resto para passar**.
- A sequência (streak) de hábitos ignorava a frequência (3×/semana, fins de semana…).
- Calculadora: dizia que bastavam 100× o salário para viver de rendimentos. São ~300× (regra dos 4%).
- Os orçamentos estavam só no dispositivo. Agora estão na conta, e os antigos são migrados automaticamente.
- Os gráficos usavam `var(--muted)` no canvas, que não funciona. Agora usam as cores reais do tema.

**Segurança**
- **Notas privadas**: estavam em texto simples no Firestore e o PIN ficava em claro no `localStorage`. Agora são encriptadas com AES-256-GCM e uma chave derivada do PIN (PBKDF2, 200 000 iterações). O cofre tranca sozinho e as notas antigas são migradas ao desbloquear.
  *Limite honesto:* um PIN de 4 dígitos protege bem contra quem espreita o Firestore, mas não contra alguém com os dados encriptados e tempo para testar as 10 000 combinações.
- Injeção de HTML/JS: títulos com `'` ou `"` partiam os `onclick` inline. Agora há escape de todo o texto e delegação de eventos com `data-act`.
- Regras do Firestore incluídas.

**Experiência**
- Modo **"Experimentar sem conta"** (dados locais), com migração para a conta ao fazer login.
- Cabeçalho mais limpo: o backup, as notificações e a sessão foram para "Perfil & definições".
- Editar tarefas e eventos (antes só dava para apagar), botão "Desfazer" ao apagar e "Anular" ao concluir.
- Próximos testes no início, filtro "Esta semana", calendário a começar à segunda-feira e lista de aulas ao abrir um dia.
- Flashcards: importação em massa (`pergunta ; resposta`, compatível com Anki/Quizlet), filtro por categoria e atalhos de teclado (espaço e 1/2/3).
- Notas: pesquisa própria, checklist, copiar, apagar dentro da nota e limite de tamanho (o Firestore aceita ~1 MB por documento).
- Pomodoro: o tempo aparece no cabeçalho enquanto corre, dá +5 XP por sessão e as notificações funcionam no Android (via service worker).
- Acessibilidade: o zoom deixou de estar bloqueado, há foco visível, `aria-*`, navegação por teclado e respeito por `prefers-reduced-motion`.
- Login por redirect quando o popup é bloqueado (iOS/Safari).

## Aviso legal (RGPD)

O registo de humor é considerado **dado de saúde** (categoria especial, art. 9.º RGPD). Antes de abrir a app ao público precisas de uma política de privacidade e de consentimento explícito para esse registo.
