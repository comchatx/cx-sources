# Changelog

## 0.2.0

- An extension keeps each answer a source's MCP tool gives, from a server the box registered as a source, whether cx called the tool directly or from a script: the whole answer in `/tenant/raw/<source>/<date>/<HHMMSS>Z-mcp-<tool>-<h8>`, each picture as a file of its own, and last its record, `<file>.ask.json`, with the tool and the arguments as typed. An error keeps nothing. A direct call's result names the file; a script's answer is the server's, unchanged.
- The skill tells cx to look among the records before buying, to read an answer fetched within the seller's `tolerance` instead of buying it again, and to cite the file and its date.
- The README says what the record beside each file keeps.

## 0.1.12

- The tile's mark on the Plugins page is the signed drawing.

## 0.1.11

- The `cost-first` and `data-costs` templates each send their Try it sentence, word for word, then the words you type after the template's name.

## 0.1.10

- The card's line is the one signed on 2026-11-19: `comchatx.about` 「替 cx 买数据，只买用得到的，可以先报价。」 and `description` "Buys only the data cx needs, and quotes first if you ask."
- The README's first paragraph, in Chinese, is the one signed on 2026-11-18 (「这是所有数据源插件的基础，……记在「设置」的「用量」里。」), and in English the paragraph of the same meaning ("This is the base every data-source plugin stands on: … listed in Settings › Usage.").
- The skill's line is the one signed on 2026-11-17, in `comchatx.skills.cx-sources` as `zh` 「购买和读取数据，查数据费用，修改数据设置。」 and `en` "Buys and reads data, says what it costs, and changes data settings.". `SKILL.md`'s `description` is unchanged.
- The `cost-first` template reads the line signed on 2026-11-17: "Before buying any data, tell me what this question costs and wait for my go-ahead: [question]" as its `description`, and 「先估算这个问题要花多少数据费，等我同意再买：【问题】」 as `comchatx.prompts.cost-first.zh`.
- The `data-costs` template's English is the line signed on 2026-11-17, "See what each of my data sources costs, and what I spent on it this month"; its Chinese is unchanged.

## 0.1.9

- The card's name is the one signed on 2026-11-17: "Data Source Core" on the English page (`comchatx.name`) and 「数据源基础功能」 on the Chinese page (`comchatx.nameZh`).
- The README, in English and Chinese, calls each plugin of ours it names by the card's name signed on 2026-11-17.
- The README names each other plugin it speaks of by the card's name in its own language, a link to that plugin's page on npm, never by the npm name.

## 0.1.8

- The card's name is the one signed on 2026-11-11, "Data Source Billing", in `comchatx.name`, the same on the Chinese and the English page.
- The README, in English and Chinese, calls each of our plugins by its card's name, not its npm name.

## 0.1.7

- The card's line and the Overview, in English and Chinese, are the words signed on 2026-11-10: "Lists each data charge in Usage, and quotes first if you ask." as npm's `description`, and 「每笔数据扣费都记进用量，也可以让 cx 先报价。」 as `comchatx.about`. They said "Manages connected data sources and their charges." and 「统一管理数据源和相关扣费。」.
- `DEVELOPING.md` holds the install line, `pi install npm:cx-sources`.

## 0.1.6

- The card's Chinese line is `comchatx.about`, the field the Plugins page reads, in place of `comchatx.description.zh`. Its words are unchanged.

## 0.1.5

- The card's Chinese line says 扣费 for a charge to your balance: 「统一管理数据源和相关扣费。」
