# TODO: opt-in virtualization

This is a plan for a future refactor. Virtualization is not enabled by the current API.

**Implementation readiness:** the first scope specified below is ready to turn into implementation slices. It is a recommended future contract, not an API already shipped by this library. Intrinsic-size measurement, keep-alive caches and arbitrary custom layouts have separate evidence gates; they are not prerequisites for the first scope.

## Goal and evidence

Support large logical collections with a bounded set of mounted slides and bounded work on the animation frame. Keep the default renderer's existing behavior. Enable virtualization explicitly, with documented resource and DOM semantics, rather than switching it on at an arbitrary slide count.

Two different costs need to be addressed:

| Cost | Current behavior | Required improvement |
| --- | --- | --- |
| Initial DOM, content factories, browser layout and retained resources | `TrackRenderer.build()` creates one wrapper per logical slide; eager slides also create their content. Lazy loading retains all wrappers and any content already loaded. | Mount only the required window; dispose or retain departing content according to an explicit bounded policy. |
| Work during motion | Finite standard layout without a render consumer changes one track transform. Loop, custom geometry/layout and effects process the complete visual collection. | Select relevant slots without scanning the entire collection, then render and apply effects to that window. Preserve the existing finite fast path. |

The performance audit of tree `5928afecd7e7ce0f0e8ff99bdb291808b0114bff` (published in `10f79a7`) measured the following synchronous render costs. These are medians of repeated operation samples, **not whole-frame durations or a display FPS claim**:

| Scenario | 1,000 logical slides | 5,000 logical slides |
| --- | ---: | ---: |
| Finite standard, no render consumer | 0.0031 ms | 0.0016 ms |
| Loop standard | 7.93 ms | 35.13 ms |
| Custom geometry and layout | 19.15 ms | 110.65 ms |
| Focus effect | 15.40 ms | 71.15 ms |
| Parallax | 2.83 ms | 19.05 ms |

The same 5,000-slide fixture mounted 100,003 descendant elements, or 110,003 with parallax. It used 19-element cards, three visible slides, no remote media, sandboxed headless Chromium 153, Node 24 and a shared Linux CPU. Results justify investigating both costs; they do not define a universal maximum collection size. Small differences must be rechecked with alternating baseline/candidate runs.

Reproduce the profile using the maintained [benchmark runner](scripts/benchmark-performance.mjs):

```sh
npm run benchmark -- --counts=10,100,1000,5000 --output=performance-results.json
```

Record the source commit/tree, browser and hardware, fixture complexity, options, raw samples, DOM counts and remaining layout work with every comparison. Run timing comparisons serially without concurrent builds or browser suites. CSS `content-visibility`, lazy loading and a smaller render snapshot can each help a specific cost, but none by itself supplies both DOM virtualization and bounded per-frame work.

### Continuous-motion check

The new continuous controller was also measured in a quiet serial run: fresh sandboxed Chromium 153 per case, 19-element cards, no network media, no `render` subscriber, 20 warmup callbacks and 120 measured native callbacks per case. The measured source/style fingerprint was SHA-256 `6aaa71c4b1d9711664fccf90cdefc3d69586d3ebd2a9671d5513dc1e53081d5d` across 66 files. These are current-mode measurements, not a before/after speedup claim.

| Mode | Logical slides | Callback median / p95 | Native frame interval median / p95 |
| --- | ---: | ---: | ---: |
| Finite | 10 | 0.1 / 0.3 ms | 16.7 / 16.7 ms |
| Loop | 10 | 0.3 / 0.8 ms | 16.7 / 16.8 ms |
| Finite | 100 | 0.1 / 0.4 ms | 16.7 / 16.8 ms |
| Loop | 100 | 1.2 / 2.8 ms | 16.7 / 16.7 ms |
| Finite | 1,000 | 0.1 / 0.3 ms | 16.7 / 16.8 ms |
| Loop | 1,000 | 7.1 / 11.7 ms | 16.7 / 33.3 ms |

All six cases delivered 120 samples with no page errors. Mounted DOM still grew from 203 to 2,003 to 20,003 elements. Steady-state layout count was zero, but the 1,000-slide loop also spent about 0.689 seconds in style recalculation over the measured window. Callback time alone therefore understates browser work. The finite frame path remains cheap; loop work and DOM size still justify the two separate virtualization goals. These shared-cloud measurements are not a device-independent frame-rate guarantee.

## Settled design constraints

- The complete ordered collection, stable keys, selected identity and navigation geometry remain independent of mounted DOM. An offscreen item is still a logical slide. Counts, navigation bounds, pagination and collection events describe the complete collection.
- A logical identity and a DOM mount are different lifetimes. Reordering an identity that remains mounted retains its node/resource. Changing its content, explicit refresh, eviction, removal and destruction follow the chosen lifetime contract. Repeated objects without an explicit `id` retain their distinct occurrence keys.
- Mounting must finish before a visible slot or transition surface needs its content. Rendering an empty window and repairing it in a later frame is not acceptable during drag, distant navigation or continuous scrolling.
- Only one original content owner may exist for a logical occurrence. A short-loop decorative replica must not instantiate another iframe, custom element or application. Virtualization reuses the decorative snapshot policy; it does not reintroduce live content cloning.
- Focused content and live transition participants cannot be evicted while in use. These pins are explicit inputs to window selection and resource accounting. Mount/unmount cannot steal focus or reset unrelated native controls.
- The core owns position, motion cancellation and the frame clock. Virtualization follows navigation, drag, snap-back and continuous scrolling on that clock; it must not add a second position source or timer-driven remount loop.
- Per-frame selection and rendering may depend on the mounted window and pins, not all logical items. Updating the complete model after a structural collection mutation may still be O(N). Geometry construction may also be O(N); it must not recur on every frame.
- DOM queries and callbacks can cause synchronous reentry. A newer update, navigation, plugin removal or destruction supersedes obsolete mount work. Every acquired resource must be released exactly once, including a factory result returned after its operation was superseded.
- Unsupported combinations must fail visibly before partial adoption, or follow an explicitly documented fallback. Silently mounting everything would defeat a requested bounded-resource mode.

## Ownership and affected contracts

| Owner | Responsibility after the refactor | Current code to inspect |
| --- | --- | --- |
| Logical collection | Full ordered data, occurrence keys and selection reconciliation; no DOM ownership | [SlideManager](src/SlideManager.js), collection methods in [Carousel](src/Carousel.js) |
| Physical geometry | Full logical snap positions, finite bounds, loop length and efficient queries for candidate visible ranges; no content factories | [NavigationGeometry](src/NavigationGeometry.js), [navigation types](src/navigationTypes.d.ts) |
| Renderer and content owner | Mounted wrappers, mount generation, DOM placement, safe decorative snapshots, content acquisition/disposal and observers | [TrackRenderer](src/TrackRenderer.js), [SlideContent](src/SlideContent.js) |
| Motion coordinator | Position, destination, interaction priority, transition pins, cancellation and render publication | [Carousel](src/Carousel.js), [render types](src/renderTypes.d.ts) |
| Effects, transitions and plugins | Consume the declared mounted/full contract and release their own per-mount work; never create hidden original owners | [PluginScope](src/PluginScope.js), [effects](src/effects/createSlideEffect.js), [plugins](src/plugins), [transitions](src/transitions) |

Keep these responsibilities in their current owners where practical. Extract a range planner only when it has the concrete responsibility of combining physical visibility, overscan and pins. A generic renderer registry, second slide manager or new scheduler is not a prerequisite.

## Recommended first-release contract

These decisions keep the first implementation bounded and testable. They deliberately change DOM lifetime only for applications that select virtual mode. The eager default keeps its current getters, render events, full-layout callbacks and retained-content behavior.

### Configuration and initial support

Proposed option shape:

```ts
virtual?: false | {
  /** Extra physical coverage on each side of the viewport, in CSS pixels. */
  overscan: number
  /** Fixed cross-axis extent; required for a horizontal virtual carousel. */
  crossSize?: number
}
```

`false` and omission select the eager renderer. `overscan` is a required finite, non-negative number, so the application explicitly chooses how much additional content to mount; no hidden slide-count threshold or default cache budget is introduced. `crossSize`, when present, must be finite and positive. Horizontal mode requires it; vertical mode can use the measured viewport width when omitted. Responsive updates revalidate the resolved combination before adopting it.

The first scope supports uniform physical geometry and `layout: 'standard'`, finite and loop navigation, both axes and fractional views. It includes continuous scrolling, drag, built-in positional/fade/cover/surface transitions, and the built-in navigation, lazy-load, focus and parallax plugins after they conform to the mounted contract. Explicit variable geometry, intrinsic main-axis sizing, expand and arbitrary custom layouts enter through the extension gates below. An unsupported combination throws before replacing the current renderer or acquiring content; it does not silently fall back to mounting the whole collection.

### Logical and mounted queries

- `getSlides()`, `getSlide(index)`, `getSlideCount()`, selection, navigation geometry and collection events continue to describe the full logical collection.
- Add `getMountedSlides()` to Carousel and `PluginContext`. It returns a detached ordered array of `{ key, index, element, generation }` entries for mounted originals, sorted by logical index. `key` is the stable opaque occurrence-key object; `generation` is a distinct opaque object identifying that mount. Callers compare those tokens by identity and do not mutate them. An unmount/remount changes `generation`, while an in-window reorder preserves it. Decorative replicas are excluded.
- `getSlideElement(index)` returns the current original or `null` if unmounted/missing. `getSlide(index)` distinguishes those cases. Queries never mount content or run a factory.
- Existing full-DOM queries `getSlideElements()` and `getVisualElements()` retain their current meanings in eager mode and throw a documented unsupported-operation error in virtual mode. Consumers migrate to mounted entries rather than accidentally interpreting a compact array index as a logical index.
- `renderSlide(index)` materializes content only for an existing mount and returns `false` for an unmounted item. Navigation/window preparation owns mounting and calls content materialization before the item is needed.

### Render publication and plugin capability

Add `getMountedRenderState()` and `render:mounted`. The frame carries the existing position, phase, direction, transition and geometry fields, plus `scope: 'mounted'`, `count` for the logical collection, and only mounted visual slots in `slides`. Each slot exposes its logical key and visual-wrapper generation as well as the existing `index`, copy flags, geometry and element. A decorative wrapper has its own generation but shares its original's logical key; it acquires no content owner. Ordering is explicit: originals in logical order followed by decorative replicas in logical/copy order. Array position is never the logical index.

`getRenderState()` and `render` keep their full-collection meanings in eager mode. In virtual mode, a full-state query or subscription throws before doing work; they never hide an O(N) frame or silently return a partial snapshot. Switching an eager instance with existing full `render` subscribers to virtual mode also fails before adoption; the caller first migrates or unsubscribes those consumers. Mounted queries/events work in both modes so built-ins can migrate once. Snapshots stay lazy: a controller that needs only position or motion-idle notifications does not allocate per-slide frames.

Add an optional plugin declaration `supportsVirtual: true`. Installing a plugin without it in virtual mode, or switching an instance with such a plugin to virtual mode, fails before adoption. Built-ins receive the declaration only after migration and conformance coverage. The declaration is a promise to use logical data and mounted DOM deliberately; it is not permission to call an unsupported full-DOM query. External plugins continue unchanged on eager carousels.

Add `mounts:beforeRemove` with `{ entries, reason }` before retiring mounts and `mounts:change` with `{ entries, mounted, unmounted, reason }` after adoption and before the next frame. Payload arrays/records are frozen; `entries` in the first event contains the retiring mounts, and in the latter it is the adopted complete mounted-original set. `mounted`/`unmounted` are the delta, and `reason` is `window`, `remove`, `replace`, `refresh`, `resize` or `destroy`. Publish only when mount membership/generation changes; an initial mount has an empty unmounted delta, and destruction publishes an empty adopted set. Their ordering is fixed: release plugin styles/observers; dispose retiring content; detach retired wrappers; acquire/attach new mounts; publish the adopted window; publish its render frame. A newer reentrant operation invalidates the obsolete continuation. Existing `render:reset` still covers explicit content/layout resets; a window shift must not clear unrelated mounts' styles.

### Content lifetime and pins

The first policy has **no keep-alive cache**. Window eviction releases the acquired content instance exactly once while attached, then removes its wrapper. Re-entry creates a fresh mount and reruns the same supported string/element/factory content path. Application state that must survive eviction is kept outside the DOM and restored by the factory. The opt-in documentation must make that difference from eager retained content explicit.

An item that never mounted does not run a factory or cleanup. Replacing or refreshing an unmounted item updates/invalidate its logical content for its next mount. A content error is isolated to the current mount; stale factory results are released using the current reentry protections. Removal and destruction release all acquired instances once, including pinned instances.

Automatically pin the slide containing focus, active gesture participants, and live transition source/destination until their owning operation releases them. Merge pins by logical key and include them in the mounted-resource count. Do not expose permanent application pins or silently cache all visited singleton applications in this first scope. Content that must remain one connected browser instance for the entire carousel lifetime uses eager mode.

A short-loop replica is a safe decorative snapshot of its mounted original; it never owns a factory instance or initializes another embedded application. Pins and replicas are distinct: a replica cannot satisfy a requirement to keep a live original mounted.

### Range, layout and accessibility semantics

Uniform range selection uses arithmetic on the canonical physical positions, viewport extent and pixel overscan. Include every intersecting slide, including partially visible endpoints. Loop windows may cross the logical boundary and may need several visual occurrences of one key. The planner returns separate logical mounts and visual slots; each logical occurrence gets at most one original owner. Original promotion and decorative coverage follow the existing loop policy.

Per-frame range selection, DOM writes and mounted effects are O(window + pins); structural collection updates can still be O(N). Horizontal track/viewport cross size follows the configured fixed extent. Vertical cross size follows the configured extent or viewport width. Nothing measures every offscreen item to compute a global maximum.

Mounted controls retain native Tab behavior; Tab traverses the mounted controls and exits the carousel rather than pretending that absent DOM is focusable. Arrow navigation, accessible previous/next controls and pagination reach any logical item by mounting its destination before focus is moved. Preserve logical slide labels and total counts; snapshots remain inert and outside form/accessibility participation. A currently focused original is pinned, including focus inside Shadow DOM. If that logical item is removed, move focus to the carousel region only when application code has not already moved it elsewhere.

Distant navigation mounts its target before lazy materialization and transition creation. Fade resolves its two participants by logical key, rather than indexing a dense element array. Surface/cover transitions keep their declared originals pinned until completion/cancellation. Continuous scrolling changes the window on the core frame; hover/focus/visibility/reduced-motion pause and resume cannot create another scheduler or evict a still-pinned owner.

## Implementation TODOs and phase gates

### 1. Separate logical state from mounted ownership without changing eager behavior

- [ ] Introduce mounted entries/generations inside the renderer; retain `SlideManager` as the only ordered collection owner. Keep the default mounted set equal to the full collection.
- [ ] Add the mounted queries and render path with the contract above. Avoid allocating both full and mounted snapshots unless both are requested.
- [ ] Inventory/migrate built-in consumers of dense DOM indexing and render arrays. Cover public types, plugin declarations, demos, lazy load, parallax, effects and transitions; leave external legacy plugins supported on the eager path.
- [ ] Add range-lifecycle notifications with the specified ordering and reentry cancellation. Prove them with a resource-owning factory and an effect that retains descendant references.

**Gate:** the complete eager regression suite passes; getters, event ordering and retained input/factory state agree with the current public contract. There is no duplicate logical manager or second clock. Temporary adapters are removed as soon as their last supported consumer migrates.

### 2. Ship bounded finite standard mounting

- [ ] Add and validate the opt-in configuration and plugin capability before acquiring virtual content. Configuration errors preserve the prior working carousel.
- [ ] Select the finite visible/overscan range arithmetically, merge pins, and reconcile keyed mounts. Dispose departing owners according to the no-cache contract.
- [ ] Preserve retained mount generations through point updates/reorder; create fresh generations on actual eviction/re-entry. Mount distant targets synchronously before rendering them.
- [ ] Cover both axes, fractional views, finite clipped endpoints, zero/one/many items, large jumps, refresh/remove/set while moving, focus and factory reentry.

**Gate:** mounted wrapper/resource count follows visible coverage, overscan and pins as logical N grows. Unmounted items never run factories due to a query. Retained mounts keep native state; remounted content follows the documented reset policy. The eager O(1) finite path remains intact.

### 3. Add continuous movement, loop coverage and supported transitions

- [ ] Reconcile the window inside the existing core frame for navigation, drag, snap-back and continuous scroll. Prepare entering content before exposing the frame.
- [ ] Represent wrap-crossing windows and visual occurrences separately from logical owners. Reuse safe snapshots for short loops and preserve the closest visible interactive original.
- [ ] Pin fade/surface participants, release pins on completion/cancellation and update identity resolution after collection changes. Remove dense indexing from the virtual transition path.
- [ ] Verify both directions, multiple cycles, paused boundary positions, resize, pointer capture, hidden documents, reduced motion, nested mutation and destroy.

**Gate:** no holes, duplicate live owners or stale snapshots at window/wrap boundaries. No independent RAF/timer drives mounting. A stale callback/handle cannot mutate a replacement window or motion owner.

### 4. Complete plugin conformance and the public release

- [ ] Lazy observers watch only current mounts and discard stale intersection callbacks. Parallax unwraps retiring mounts; effect ledgers release detached descendants without clearing unrelated content.
- [ ] Navigation, dots, thumbnails and counters use logical counts. Report any O(N) pagination/thumb UI separately; virtualizing slides does not automatically virtualize those controls.
- [ ] Add `supportsVirtual: true` only to migrated implementations and verify rejection/cleanup for unsupported custom plugins. Document the external-plugin migration to mounted queries/events.
- [ ] Update manual declarations, type tests, both READMEs, plugin docs and a large-collection demo. Regenerate `dist` through the normal build and run the packaged-consumer checks.

**Gate:** built-in supported combinations share conformance tests; source, types, package and demo expose the same behavior. No full-array compatibility scan remains on the virtual frame path. The opt-in mode is described as recreating evicted content, not preserving all visited browser instances.

## Extension evidence gates

These are follow-up design investigations, not incomplete requirements of the first scope. Each must update the contracts above before dependent production work starts.

| Extension | Evidence task | Decision / stop condition |
| --- | --- | --- |
| Explicit variable geometry | Prototype interval lookup against ordered offsets with wide/overlapping slides and arbitrary gaps; test zero geometry and loop boundaries. | Range discovery includes long slides starting before the viewport and costs O(log N + candidates). Searching snap points alone is not enough. |
| Expand/custom layouts | Compare canonical and actual visual coverage under expansion/peek; prototype a declared range/capability callback without changing legacy full-array inputs. | The extension declares which logical items it can bring into view and supplies a bounded candidate set. Unsupported layouts retain clear rejection in virtual mode. |
| Intrinsic sizes and auto height | Measure image/font/content changes on a bounded window; test estimate invalidation and anchor correction during drag/scroll. | Specify estimate ownership, invalidation, cross-axis behavior and position correction without jumps or forced measurement of every offscreen item. |
| Keep-alive/singleton content | Traverse forms, editors, iframes and custom elements through connected/detached cache prototypes; count active resources and lifecycle callbacks. | Specify connectedness, cache capacity/eviction, pin accounting and state guarantees. A detached or ever-growing cache cannot be described as bounded resource virtualization. |
| Adaptive overscan | Measure real mount cost, native frame delivery and supported motion speeds on target devices, including direction reversal. | Derive an explicit bounded rule from measured latency/speed; keep application configuration and resource accounting visible. Do not replace it with a universal item-count cutoff. |

## Verification and performance acceptance TODOs

- [ ] Add behavioral tests for zero/one/many items; finite and loop bounds; distant jumps; fractional views; both axes; reverse direction; large drag deltas; continuous movement; resize and breakpoint changes; content refresh; move/remove/set while moving; and destroy during factory or mount callbacks.
- [ ] Check logical identity and DOM identity separately. Retained mounts keep input values/listeners; a policy-defined remount follows the documented state contract. Removed/evicted resources and failed factories have exact disposal counts.
- [ ] Check actual browser behavior for focus, forms, embedded documents, custom elements, canvas/media and Shadow DOM. A mock DOM cannot prove browsing-context or custom-element lifecycle guarantees.
- [ ] Assert a structural bound derived from the configured window, overscan, pins and cache. Instrument visited/rendered slot counts so O(window) claims do not rest on noisy wall-clock timings. A growing logical count with identical visible content must not grow mounted wrappers or steady-state style writes.
- [ ] Extend `scripts/benchmark-performance.mjs` with matched eager/virtual fixtures and first/middle/last/wrap windows. Measure constructor plus layout, first useful paint/content availability, mount/unmount cost, content replacement, reordering, continuous scroll and rapid direction changes. Use expensive content factories as a separate profile, not only simple cards.
- [ ] Record native rAF intervals and callback cost separately from browser style/layout/paint work; include mounted DOM counts, allocations, long frames and peak resource counts. Allow enough frames for a meaningful tail estimate; a short run with only a few frames cannot establish p95 smoothness.
- [ ] Repeat suspicious differences in an alternating baseline/candidate order. Performance acceptance requires improved startup/DOM scaling and bounded steady-state work without a material regression in the eager finite fast path. Set device-specific frame targets only after choosing and measuring the target device/profile.
- [ ] Run repeated window traversal and create/destroy cycles. After browser GC checkpoints, detached nodes, listeners, observers and content owners must not grow with traversal history. A bounded retained cache is included in the accounting; exact heap byte equality is not a valid invariant.
- [ ] Run the full existing Node/type/browser checks, package consumer import checks and source/`dist` consistency checks after focused behavior proof. Add representative virtual-mode demo coverage and verify reduced-motion behavior.

## Completion criteria

The refactor is complete only when its measured benefit matches its declared scope: bounded DOM/resource work **and** bounded per-frame work for every supported virtual configuration. Source code, public declarations, extension contracts, demo behavior and documentation must agree. Preserve or explicitly replace each old contract at its owning boundary; remove superseded full-array hot paths from the virtual implementation rather than retaining hidden compatibility scans.
