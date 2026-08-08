# oh-my-freebuff

**Teams-first, multi-agent orchestration for [Freebuff](https://freebuff.com) / [Codebuff](https://codebuff.com).**
A curated pack of specialist agents and orchestrators you drop into any project's
`.agents` folder — inspired by [oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode),
built for the Freebuff/Codebuff agent runtime.

> 🇹🇷 Türkçe açıklama için [aşağı kaydır](#türkçe).

---

## Why

Freebuff is a free coding agent built on the open Codebuff platform, and Codebuff
lets you define your own agents in a `.agents/` directory. `oh-my-freebuff` uses
that extension point to ship a ready-made **team of agents** plus **orchestrators**
that coordinate them — so instead of one agent doing everything, you get a
research → design → plan → implement → review → verify pipeline with smart model
routing (cheap models for search and simple edits, strong models for design,
review and hard debugging).

No new product, no fork of Freebuff — just a better set of agents for the client
you already use.

## Install

```bash
# one-off, no global install needed
npx oh-my-freebuff install            # copies the pack into ./.agents

# or install the CLI globally
npm i -g oh-my-freebuff
omf install                           # into ./.agents  (this project)
omf install --global                  # into ~/.agents  (available in every project)
```

Then run Freebuff (or Codebuff) in that project and point it at an orchestrator:

```bash
freebuff
# then, in the session:
#   "use omf-team to add pagination to the users API and cover it with tests"
```

Verify your setup any time:

```bash
omf doctor
```

## What's in the pack

### Orchestrators — your entry points

| Agent | Use it when you want… |
| --- | --- |
| **omf-team** | The full pipeline. Research → design → plan → implement → test → review, looping back on review findings. The default "just get it done well." |
| **omf-autopilot** | Lower ceremony. One capable agent drives the task directly, pulling in a researcher/reviewer/debugger only when it helps. Good for well-defined tasks. |
| **omf-ralph** | A persistent verify-fix loop. Give it a check command (tests, typecheck, build) and it grinds until that command is actually green — and refuses to fake it. |

### Specialists — spawned by the orchestrators (or call them directly)

| Agent | Role | Tier |
| --- | --- | --- |
| **researcher** | Read-only context gathering across code + web | fast/cheap |
| **architect** | High-level technical design before big changes | strong |
| **planner** | Turns a goal/design into an ordered, checkable todo list | strong |
| **implementer** | Writes the code for one well-scoped task | coding |
| **reviewer** | Adversarial correctness/quality review; reports, doesn't rubber-stamp | strong |
| **tester** | Writes and runs tests, reports pass/fail honestly | coding |
| **debugger** | Root-causes a failure before touching code | strong/reasoning |
| **docs-writer** | READMEs, comments, changelogs, usage guides | fast/cheap |

### Smart model routing

Agents are pre-assigned to model tiers so you don't pay for a reasoning model to
find a file, or trust a cheap model to catch a subtle bug:

- **Fast/cheap** (`deepseek-chat-v3`, `glm-4.x-flash`, `gemini-flash`) → research, docs.
- **Coding** (`qwen3-coder-plus`) → implementation and tests.
- **Strong/reasoning** (`glm-4.7`, `deepseek-r1`) → architecture, review, debugging, and the team lead.

Every agent is a plain file — open `.agents/oh-my-freebuff/<agent>.ts` and change
the `model` line to any [OpenRouter model id](https://openrouter.ai/models) you prefer.

## CLI reference

```
omf install      Copy the agent pack into this project's .agents directory
omf update       Re-copy the latest pack (overwrites the installed copy)
omf uninstall    Remove the installed pack
omf list         List the agents in the pack
omf doctor       Check your setup
omf help         Show help

Options:
  -g, --global       Target ~/.agents instead of ./.agents
  -d, --dir <path>   Install into <path>/.agents
  -f, --force        Overwrite an existing install
```

## How it fits together

```
you ──▶ omf-team ─┬─▶ researcher ×N        (parallel, read-only context)
                  ├─▶ architect            (design)
                  ├─▶ planner              (ordered todo list)
                  ├─▶ implementer ×N       (the edits)
                  ├─▶ tester / debugger    (make it work)
                  └─▶ reviewer             (must-fix loop) ──▶ done
```

Orchestrators spawn specialists with the `spawn_agents` tool. Each specialist
starts fresh with only the brief it's given, so the lead is responsible for
handing down exactly the files, constraints, and definition of done each one
needs. Independent work runs in parallel; edits to the same file are serialized.

## Customizing

The pack is just files. After `omf install`:

- **Change a model:** edit the `model:` field in any `.agents/oh-my-freebuff/*.ts`.
- **Tweak behavior:** edit the agent's `instructionsPrompt`.
- **Add your own agent:** drop a new `.ts` file next to the others exporting an
  `AgentDefinition` (types live in `.agents/types/agent-definition.ts`), and add
  its id to an orchestrator's `spawnableAgents`.

## Requirements

- Node.js ≥ 18 (for the `omf` CLI)
- The Freebuff or Codebuff CLI to actually run the agents (`npm i -g freebuff`)

## Development

```bash
npm install       # dev only (TypeScript, for typechecking)
npm run typecheck # type-check the agent definitions
npm test          # static integrity checks on the pack
```

## License

MIT — see [LICENSE](./LICENSE).

Not affiliated with Freebuff or Codebuff; it builds on their open, documented
`.agents` extension point.

---

<a name="türkçe"></a>

## 🇹🇷 Türkçe

**Freebuff / Codebuff için çok-ajanlı orkestrasyon paketi.**
Freebuff, açık kaynak Codebuff platformu üzerine kurulu ücretsiz bir kodlama
ajanı ve Codebuff kendi ajanlarını `.agents/` klasöründe tanımlamana izin
veriyor. `oh-my-freebuff` bu uzantı noktasını kullanarak hazır bir **ajan takımı**
ve onları koordine eden **orkestratörler** getiriyor — tek bir ajanın her şeyi
yapması yerine, araştır → tasarla → planla → uygula → test et → incele hattı ve
akıllı model yönlendirme (arama ve basit düzenlemeler için ucuz modeller;
tasarım, inceleme ve zor hata ayıklama için güçlü modeller).

[oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode)'un Claude
Code için yaptığını, bu paket Freebuff için yapıyor. Yeni bir ürün değil,
Freebuff'ı çatallamak (fork) da değil — hâlihazırda kullandığın istemci için daha
iyi bir ajan seti.

### Kurulum

```bash
npx oh-my-freebuff install     # paketi ./.agents içine kopyalar
# ya da:
npm i -g oh-my-freebuff
omf install                    # bu projeye (./.agents)
omf install --global           # her projede kullanılabilir (~/.agents)
```

Ardından o projede Freebuff'ı çalıştırıp bir orkestratöre görev ver:

```bash
freebuff
#   "omf-team ile users API'sine sayfalama ekle ve testlerle kapsa"
```

Kurulumu kontrol et: `omf doctor`

### Pakette ne var

**Orkestratörler (giriş noktaların):**

- **omf-team** — Tam hat: araştır → tasarla → planla → uygula → test et → incele,
  inceleme bulgularında geri döner. Varsayılan "düzgünce hallet".
- **omf-autopilot** — Daha az tören. Yetenekli tek ajan görevi doğrudan sürdürür,
  gerektiğinde araştırmacı/inceleyici/hata-ayıklayıcı çağırır. İyi tanımlı görevler için.
- **omf-ralph** — Israrcı doğrula-düzelt döngüsü. Bir kontrol komutu ver (test,
  tip kontrolü, build); o komut gerçekten yeşile dönene kadar uğraşır ve numara yapmaz.

**Uzman ajanlar:** researcher, architect, planner, implementer, reviewer, tester,
debugger, docs-writer. Orkestratörler bunları `spawn_agents` ile çağırır; doğrudan
da kullanabilirsin.

**Akıllı model yönlendirme:** dosya bulmak için pahalı bir düşünme modeli
ödemezsin, ince bir hatayı yakalaması için de ucuz modele güvenmezsin. Her ajan
düz bir dosya — `.agents/oh-my-freebuff/<ajan>.ts` içindeki `model` satırını
istediğin [OpenRouter model id](https://openrouter.ai/models)'siyle değiştir.

### Özelleştirme

Paket sadece dosyalardan ibaret. `omf install` sonrası: model değiştirmek için
`model:` alanını, davranışı değiştirmek için `instructionsPrompt`'u düzenle; kendi
ajanını eklemek için yeni bir `.ts` dosyası koyup id'sini bir orkestratörün
`spawnableAgents` listesine ekle.

### Gereksinimler

- Node.js ≥ 18 (`omf` CLI için)
- Ajanları çalıştırmak için Freebuff veya Codebuff CLI (`npm i -g freebuff`)

### Lisans

MIT. Freebuff veya Codebuff ile resmi bir bağlantısı yoktur; onların açık ve
belgelenmiş `.agents` uzantı noktası üzerine kuruludur.
