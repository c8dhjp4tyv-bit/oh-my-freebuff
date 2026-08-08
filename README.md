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

Nine orchestration modes — pick by the shape of the task (full guide in
[docs/MODES.md](./docs/MODES.md)):

| Agent | Use it when you want… |
| --- | --- |
| **omf-team** | The default. Research → design → plan → implement → test → review, looping back on review findings. |
| **omf-autopilot** | Lower ceremony. One agent drives directly, pulling in helpers only when needed. |
| **omf-pipeline** | Strict sequential stages with a gate between each. Order & auditability. |
| **omf-ultrawork** | Many independent edits in parallel (rename everywhere, lint the repo). |
| **omf-ultraqa** | Cycle the full quality gate (tests + typecheck + lint + build) to zero. |
| **omf-ralph** | Grind one check command (tests/build) until it's actually green. |
| **omf-ralplan** | Competing plans, critiqued against each other, synthesized into one. |
| **omf-advisor** | A cross-model second opinion: same question to three different models. |
| **omf-deep-interview** | Turn a vague request into a precise spec via a few sharp questions. |

### Specialists — spawned by the orchestrators (or call them directly)

| Agent | Role | Tier |
| --- | --- | --- |
| **file-picker** | Ultra-fast "which files matter" shortlist | fast |
| **researcher** | Read-only context gathering across code + web | fast |
| **architect** | High-level technical design before big changes | strong |
| **designer** | UI/UX and API-surface design | strong |
| **planner** | Turns a goal/design into an ordered, checkable todo list | strong |
| **implementer** | Writes the code for one well-scoped task | coding |
| **refactorer** | Behavior-preserving restructuring, proven by tests | coding |
| **reviewer** | Adversarial correctness/quality review; reports, doesn't rubber-stamp | strong |
| **security-reviewer** | Attacker's-eye audit with concrete exploit scenarios | strong |
| **critic** | Strategic pushback on the approach, not the syntax | strong |
| **tester** | Writes and runs tests, reports pass/fail honestly | coding |
| **debugger** | Root-causes a failure before touching code | reasoning |
| **data-scientist** | Data exploration, queries, metrics grounded in real data | strong |
| **docs-writer** | READMEs, comments, changelogs, usage guides | fast |
| **advisor-a/b/c** | Three voices of the multi-model advisor panel | panel |

### Smart model routing — `budget` · `balanced` · `premium`

Agents are assigned to tiers so you don't pay for a reasoning model to find a
file, or trust a cheap model to catch a subtle bug. Switch the whole pack's cost
profile with one command:

```bash
omf preset budget      # cheapest, open models only
omf preset balanced    # default — strong open models, good value
omf preset premium     # frontier models (Claude/GPT/Gemini), highest cost
```

`omf preset` rewrites every agent's `model:` field per its tier and remembers the
choice. Full tier→model matrix in
[docs/MODEL-COMPATIBILITY.md](./docs/MODEL-COMPATIBILITY.md). Every agent is a
plain file, so you can also pin any single one to any
[OpenRouter model](https://openrouter.ai/models) by hand.

## CLI reference

```
Setup
  omf setup                 Install pack + seed config + knowledge.md (one-shot)
  omf install               Copy the agent pack into this project's .agents
  omf update                Re-copy the latest pack (overwrites installed copy)
  omf uninstall             Remove the installed pack
  omf doctor                Check your setup

Agents & models
  omf list                  List the agents in the pack
  omf preset [name]         Show or apply a model preset (budget|balanced|premium)

Config
  omf config                Print effective config
  omf config get <key>      Read a value
  omf config set <k> <v>    Write a value (--global for user scope)

Skills
  omf skill list            List custom skills
  omf skill add <name>      Scaffold a new skill
  omf skill remove <name>   Delete a skill
  omf skill search <q>      Search skills

Notifications
  omf notify setup <ch>     Configure telegram|discord|slack|file
  omf notify test           Send a test notification
  omf notify status         Show configured channels

Options
  -g, --global              Target ~/.agents and user-scope config
  -d, --dir <path>          Operate on <path>/.agents
  -f, --force               Overwrite an existing install
```

## Notifications

Get pinged when a long run finishes. Configure a channel, then wire
`hooks/notify.mjs` into any completion callback (or call `omf notify test`):

```bash
omf notify setup slack https://hooks.slack.com/services/...
omf notify setup telegram <bot-token> <chat-id>
omf notify setup file ./omf-notify.log
omf notify test
```

Channels: **Telegram, Discord, Slack, file**. Messages support `{{projectName}}`
and other template variables.

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

## Docs

- [docs/MODES.md](./docs/MODES.md) — every orchestration mode and when to use it
- [docs/MODEL-COMPATIBILITY.md](./docs/MODEL-COMPATIBILITY.md) — tiers, presets, the full model matrix
- [docs/PARITY.md](./docs/PARITY.md) — what's ported from oh-my-claudecode, what's adapted, what's intentionally out of scope

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

**9 orkestrasyon modu (giriş noktaların):** `omf-team` (tam hat, varsayılan),
`omf-autopilot` (otonom), `omf-pipeline` (sıralı, denetlenebilir), `omf-ultrawork`
(paralel toplu düzenleme), `omf-ultraqa` (tüm kalite kapısını yeşile çevir),
`omf-ralph` (tek komutu yeşile çevir), `omf-ralplan` (planlama konsensüsü),
`omf-advisor` (çok-model ikinci görüş), `omf-deep-interview` (belirsiz isteği
Sokratik sorularla nete çevir). Ayrıntı: [docs/MODES.md](./docs/MODES.md).

**26 ajan toplam.** Uzmanlar: file-picker, researcher, architect, designer,
planner, implementer, refactorer, reviewer, security-reviewer, critic, tester,
debugger, data-scientist, docs-writer, advisor-a/b/c. Orkestratörler bunları
`spawn_agents` ile çağırır; doğrudan da kullanabilirsin.

**Akıllı model yönlendirme:** her ajan bir *tier*'a atanır, presetler tier'ları
gerçek modellere eşler. Tek komutla maliyet profilini değiştir:

```bash
omf preset budget      # en ucuz, sadece açık modeller
omf preset balanced    # varsayılan — güçlü açık modeller, iyi değer
omf preset premium     # frontier modeller (Claude/GPT/Gemini)
```

Tam tier→model matrisi: [docs/MODEL-COMPATIBILITY.md](./docs/MODEL-COMPATIBILITY.md).

**Bildirimler:** Telegram/Discord/Slack/dosya — `omf notify setup <kanal>` ve
`omf notify test`. Uzun bir iş bitince haber al.

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
