# JSONata: comprehensive research for an Architecture Decision Record

**JSONata is a lightweight, declarative, Turing-complete query and transformation language for JSON data** — the only widely adopted tool that combines rich querying and full structural transformation in a single embeddable expression language. Created by Andrew Coleman at IBM in 2016 and inspired by XPath 3.1, it has grown from an internal IBM tool into a language adopted by AWS Step Functions, Node-RED, Stedi, Cloudflare, and dozens of enterprise integration platforms. With **~430K–960K weekly npm downloads**, zero runtime dependencies, an MIT license, and ports to 8+ programming languages, JSONata occupies a unique niche between simple query-only tools (JSONPath) and full programming languages (JavaScript). This report covers everything needed for an Architecture Decision Record evaluating JSONata.

---

## What JSONata is and how it works

JSONata is a **declarative expression language** purpose-built for navigating, extracting, filtering, combining, and restructuring JSON data. Its design philosophy draws directly from XPath 3.1's location path semantics, giving JSON the same query power that XPath and XSLT give XML. A critical property: **JSONata is a superset of JSON** — any valid JSON document is also a valid JSONata expression, which means JSON documents can serve as output templates with embedded dynamic expressions.

The execution model follows a **two-phase compile-then-evaluate pattern**. First, the `jsonata()` function parses an expression string into an immutable Abstract Syntax Tree (AST). Second, the `evaluate()` method runs this AST against input JSON data with optional variable bindings and returns the transformed result. The compiled expression object can be reused across multiple evaluations with different input data — this is the primary performance optimization technique. Since v2.0.0 (December 2022), `evaluate()` returns a Promise, reflecting an internal rewrite from generators to async/await for improved performance.

```javascript
const jsonata = require('jsonata');
const expression = jsonata('$sum(Account.Order.Product.(Price * Quantity))');
const result = await expression.evaluate(inputData);
```

JSONata's type system extends JSON's native types (string, number, boolean, null, object, array) with **functions as a first-class type**. Path expressions return "result sequences" governed by specific flattening rules: empty sequences produce nothing (no output), singleton sequences unwrap to the bare value, and multi-value sequences become arrays.

---

## Technical capabilities span querying through functional programming

JSONata's feature set covers a remarkably broad spectrum. **Path expressions** form the core — `Address.City` navigates structure, `Phone[type='mobile'].number` filters then selects, and `Account.Order.Product.(Price * Quantity)` maps with inline computation. Six path processing stages (map, filter, sort, index, join, reduce) chain declaratively with well-defined precedence rules.

The **built-in function library** is extensive:

- **String functions**: `$substring()`, `$replace()`, `$split()`, `$join()`, `$uppercase()`, `$lowercase()`, `$trim()`, `$match()`, `$base64encode()`, `$encodeUrl()`, and more
- **Numeric and aggregation**: `$sum()`, `$max()`, `$min()`, `$average()`, `$count()`, `$round()`, `$power()`, `$sqrt()`, `$formatNumber()`
- **Higher-order functions**: `$map()`, `$filter()`, `$reduce()`, `$sift()`, `$each()`, `$sort()`, `$single()`
- **Object manipulation**: `$keys()`, `$values()`, `$spread()`, `$merge()`, `$type()`, plus the transform operator (`|...|...|`) for modifying copies of object structures

JSONata supports **user-defined lambda functions** (`function($x, $y) { $x + $y }` or using the Greek λ symbol), **closures with lexical scoping**, **partial application** via the `?` placeholder, and **function chaining** with the `~>` pipe operator. The language implements **tail-call optimization** — the parser detects tail-recursive functions and internally rewrites them as loops, preventing stack overflow. Regular expressions evaluate to higher-order matcher functions, and the **recursive descent wildcard** (`**`) selects values at any nesting depth.

Conditional logic includes the ternary operator (`predicate ? expr1 : expr2`), the **Elvis/default operator** (`?:`, added in v2.1.0), and the **nullish coalescing operator** (`??`, also v2.1.0). Variables use `$` prefix with block-scoped binding via `:=`, where `$` represents the current context and `$$` references the document root.

---

## Real-world adoption spans cloud providers to IoT platforms

JSONata's adoption profile has shifted dramatically with high-profile enterprise integrations. **AWS Step Functions** added JSONata as an official query language at re:Invent 2024, replacing five JSONPath fields with just two (`Arguments` and `Output`) and enabling complex data transformations directly in state machines without Lambda functions. AWS recommends JSONata for new workflows — a major endorsement.

**Node-RED** (OpenJS Foundation, originally IBM) treats JSONata as a first-class citizen, available in standard nodes via the `J: expression` option. This is JSONata's largest community adoption vector, powering IoT sensor data conversion, MQTT payload restructuring, and Home Assistant integrations. **IBM** uses JSONata across App Connect Enterprise, z/OS Connect Designer, and DataPower Gateway, and maintains the JSONata4Java implementation.

**Stedi**, a modern EDI platform, built its entire mapping engine on JSONata and maintains **jsonata-rs** (a Rust implementation). Their visual Stedi Mappings product transforms X12 EDI documents (purchase orders, invoices) to and from JSON using JSONata expressions. **Cloudflare Zaraz** uses JSONata for tag management data operations. **Blues Wireless** uses JSONata in their Notehub IoT platform for sensor data transformation before cloud routing, and maintains **jsonata-go**. **Kestra** uses JSONata as a "Swiss Army Knife" for Kafka stream transformations in data orchestration workflows. Other adopters include **Grafana** (JSON datasource plugin), **Prismatic** (iPaaS), **HCL Workload Automation**, and **Rhize** (manufacturing BPMN workflows).

The multi-language ecosystem includes implementations in JavaScript (reference), Java (IBM JSONata4Java and Dashjoin), Rust (Stedi), Go (Blues), Python (two implementations), .NET, C, and C++.

---

## Performance trades speed for expressiveness at a known ratio

NearForm's authoritative benchmark study found JSONata is typically **5–10x slower than equivalent hand-written JavaScript** for data transformations, with the gap varying by operation complexity. Simple property navigation shows the largest difference (~15–50x slower), while complex transformations with joins narrow the gap significantly. A GitHub issue reported **~15ms per evaluate call** on 500KB JSON, totaling 90 seconds for 6,000 evaluations versus under 10 seconds with hand-written loops — roughly a 9x slowdown.

The **critical optimization** is expression pre-compilation: parse once with `jsonata(expr)`, then call `evaluate()` repeatedly against different input data. This avoids re-parsing overhead on each invocation. For AWS Step Functions, JSONata expressions run inside the service engine itself, completing in milliseconds and avoiding Lambda cold starts entirely.

The Node-RED community notes a practical threshold: **arrays exceeding ~500 elements** cause significant CPU processing that can temporarily halt the runtime. JSONata processes data single-threaded with no parallel processing of array elements.

Cross-implementation benchmarks show Dashjoin's Java port outperforms IBM's JSONata4Java in throughput and average execution time. The pure Python implementation outperforms the JS-binding-based Python library by eliminating bridge overhead. NearForm's conclusion: **"Typically yes [the performance cost is worth it], but it depends on whether you have specific performance constraints."** For applications making API calls or database operations where I/O dominates, JSONata's overhead is negligible.

---

## Alternatives each occupy distinct positions in the trade-off space

**JMESPath** is JSONata's closest competitor for embedded JSON querying, with a formal ABNF specification, compliance test suite, and the broadest multi-language support (12+ official implementations). Used by the AWS CLI and Ansible (~8.5M weekly npm downloads), it excels at standardized querying but **cannot reshape data deeply** — limited to basic projections and multi-select hashes. Choose JMESPath when cross-language portability and formal spec compliance matter; choose JSONata when you need full transformation capabilities.

**JSONPath** (now RFC 9535, published February 2024) is the simplest option — a query-only language for extracting values from JSON structures. With ~11M combined weekly npm downloads across implementations and adoption in Postman, Kubernetes, and MongoDB tools, it has the widest reach. However, it **cannot transform or create new structures**. Choose JSONPath for pure extraction tasks where IETF standardization matters.

**jq** offers near-parity with JSONata in transformation power but is **CLI-first** (written in C, Unix pipe philosophy). It handles streaming natively and performs excellently on large files. JSONata handles arrays more leniently (implicit iteration versus jq's explicit `[]` syntax) and runs natively in browsers. Choose jq for command-line processing and shell scripting; choose JSONata for embedded application use, especially in browser or Node.js contexts.

**Custom JavaScript (with lodash/Ramda)** offers unlimited flexibility and **3–15x better performance** but produces verbose, harder-to-maintain code for complex transformations. A 20-line nested JavaScript transformation often collapses to 1–3 lines of JSONata. The critical trade-off: JSONata expressions can be **safely externalized** (stored as config strings, edited by non-developers, evaluated without arbitrary code execution risk), whereas custom JavaScript requires full sandboxing for untrusted input. **GraphQL** operates at a fundamentally different layer (client-server API protocol) with minimal overlap. **JSON Schema** is complementary, not competitive — it validates structure while JSONata transforms it. A common pipeline validates input with JSON Schema, transforms with JSONata, then validates output.

| Tool | Query | Transform | Standard | Languages | npm weekly | Best for |
|------|-------|-----------|----------|-----------|------------|----------|
| JSONata | ✅ | ✅✅ | No | 8+ | ~430K–960K | Embedded transformation |
| JMESPath | ✅✅ | Limited | Formal spec | 12+ | ~8.5M | AWS ecosystem, standardized querying |
| JSONPath | ✅✅ | No | RFC 9535 | 50+ | ~11M | Simple extraction, broadest tool support |
| jq | ✅ | ✅✅ | No | C, Go | N/A (CLI) | Command-line, streaming, large files |
| Custom JS | ✅ | ✅✅ | N/A | JavaScript | N/A | Hot paths, maximum flexibility |

---

## Security requires deliberate safeguarding of extension points

JSONata expressions are parsed into ASTs and evaluated by JSONata's own engine — **not** via JavaScript `eval()`. Expressions cannot directly call `process.exit()`, `require()`, `fs`, `http`, or any Node.js APIs. This provides meaningful isolation, but JSONata is **not a full JavaScript sandbox**. The primary security boundary depends on what the host application exposes: if extension functions registered via `registerFunction()` access the filesystem or network, untrusted expressions can reach those capabilities.

The most significant vulnerability was **CVE-2024-27307** (CVSS 8.3, High Severity) — a prototype pollution flaw in the transform operator allowing malicious expressions to override properties on `Object.prototype`. This affected versions ≥1.4.0 <1.8.7 and ≥2.0.0 <2.0.4, discovered by Albert Pedersen of Cloudflare. It was patched by adding checks that throw error code `D1010: "Attempted to access the Javascript object prototype"`. Applications must run **v2.0.4 or later**.

**Resource exhaustion** is a medium-level risk. JSONata's Turing-completeness means recursive functions can loop indefinitely (though tail-call optimization prevents stack growth for tail-recursive functions). Range expressions like `[1..1000000000]` can exhaust memory. The JavaScript reference implementation provides **no built-in timeout or resource-limiting mechanisms**. However, the Java (Dashjoin) and Go implementations offer `setRuntimeBounds(timeout, maxRecursionDepth)`, `SetMaxDepth`, `SetMaxRange`, and `SetMaxTime` respectively. Best practice for the JS implementation: wrap evaluation in `Promise.race` with a timeout, validate input data size, limit expression complexity, and never register dangerous extension functions in untrusted contexts.

---

## Known limitations and edge cases demand careful testing

**Silent undefined behavior** is JSONata's most frequently cited pain point. Queries on non-existent paths return `undefined` (nothing) with no error, making debugging complex expressions challenging. NearForm recommends always validating incoming data before transformation and unit testing every JSONata expression.

**Singleton array unwrapping** surprises many developers: `$filter([0,0,5,0], function($e) { $e != 0 })` returns `5` (a scalar), not `[5]` (an array). The `[]` operator forces array output but its position-independent behavior within path expressions is counter-intuitive. **Null handling** has known inconsistencies — `$lookup()` throws errors on null property values while direct path access returns null correctly, and the JavaScript API cannot distinguish between explicit `null` and missing fields.

**Floating-point arithmetic** is unreliable for financial calculations. Stedi explicitly warns against using JSONata for monetary math and recommends representing values as integers (cents). A known parallel evaluation bug (Issue #335) causes expressions using the `~>` chain operator to fail when evaluated concurrently, producing function signature errors. Internal metadata properties (`sequence: true`, `keepSingleton: true`) can leak onto result arrays, causing issues in Node-RED where augmented arrays behave differently from vanilla arrays.

The **learning curve** is moderate — JSONata's compact functional syntax differs from imperative programming and requires ramp-up for developers unfamiliar with declarative paradigms. Debugging tooling is limited to the online JSONata Exerciser (try.jsonata.org), VS Code extensions for syntax highlighting and validation, and the `$type()` / `$exists()` introspection functions. There is no automated testing framework specifically for JSONata expressions.

---

## Ecosystem health is strong but concentrated around a single maintainer

| Metric | Value |
|--------|-------|
| Current version | **2.1.0** (July 31, 2025) |
| License | MIT |
| Weekly npm downloads | ~430K–960K |
| npm dependents | 490 packages |
| GitHub stars | ~2,500 |
| Forks | ~260 |
| Open issues | ~150 |
| Runtime dependencies | **Zero** |
| Package size | 831 KB unpacked |
| Total published versions | 53 over ~9 years |
| Primary maintainer | Andrew Coleman (IBM) |
| Core contributors | ≤10 |

The **single-maintainer concentration** is a notable risk factor. Andrew Coleman has driven the project since its creation, with a small contributor base. Release cadence is steady at 2–4 releases per year. The v1.x branch remains maintained (v1.8.7, March 2024) alongside v2.x. Snyk rates JSONata as an "Influential project" with a health score of 76/100 and "Sustainable" maintenance status.

**Version history milestones**: v1.5–1.7 introduced user-defined functions, higher-order functions, regex, and sorting/grouping. v1.8 added URL helpers, `$distinct`, and `$eval`. **v2.0.0 (December 2022)** was the only major breaking change — the evaluator was rewritten from generators to async/await, making `evaluate()` return a Promise while keeping the JSONata language itself unchanged. v2.1.0 (July 2025) added the `?:` default and `??` coalescing operators.

---

## Architecture patterns where JSONata fits naturally

JSONata integrates cleanly into several well-established patterns. In **serverless workflow orchestration**, AWS Step Functions uses JSONata to transform data between states, eliminating Lambda functions for data mapping and reducing cold starts, IAM overhead, and concurrency costs. In **IoT edge-to-cloud pipelines**, Blues Wireless routes sensor data through JSONata transformations before cloud delivery, reducing bandwidth and processing costs. In **low-code event processing**, Node-RED embeds JSONata in Change and Switch nodes, keeping flows visual and replacing JavaScript function nodes. In **EDI integration**, Stedi powers bidirectional EDI-to-JSON conversion with visual mapping backed by JSONata expressions. In **stream transformation**, Kestra uses JSONata TransformValue tasks between Kafka topics for real-time event processing.

The most architecturally significant pattern is using JSONata as an **externalized, configurable transformation layer**. Because expressions are strings that can be stored in databases, configuration files, or workflow definitions, non-developers can modify transformation logic without code deployments. This decouples transformation rules from application code — a property that custom JavaScript cannot safely provide without elaborate sandboxing.

## Conclusion

JSONata uniquely combines **JSON querying and full structural transformation** in a single embeddable expression language — a capability no direct competitor matches. Its adoption by AWS Step Functions in 2024 validated it as enterprise-grade. The key architectural trade-offs are clear: accept a **5–10x performance penalty** versus native JavaScript (acceptable for most non-hot-path use cases), a **moderate learning curve** for the functional syntax, **silent undefined behavior** requiring disciplined testing, and **single-maintainer risk** offset by broad multi-language ecosystem support. Security is sound with current patches (v2.0.4+) but demands careful management of extension functions and application-level timeouts for untrusted expressions. For an ADR, JSONata is strongest when the decision context involves configurable data transformation in integration workflows, API middleware, or event-driven architectures — and weakest when raw performance, formal standardization, or query-only simplicity are the primary requirements.