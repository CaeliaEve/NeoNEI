# Shared visual work

This describes current implementation pending the unified verification batch.
It does not report measured page latency, FPS or a speedup multiplier.

Browser, recipe and animation Atlas instances share a two-job bitmap decoder.
Only one background decode may start at a time, leaving a slot for visible first
paint. Pending work can be promoted when a speculative asset becomes visible.
The existing shared decoded-memory ceiling remains 192 MiB; pending sprite
copies reserve their bytes before yielding so simultaneous Atlas instances
cannot each spend the same remaining allowance.

Within an Atlas, two visible frame jobs may proceed, but a speculative frame may
start only while idle. A foreground job can overtake a background frame waiting
for network/cache I/O. Identical active frame keys stay serialized so duplicate
consumers reuse one retained bitmap instead of creating competing cache entries.
Global decode concurrency still bounds actual native bitmap operations.

Cancellation removes queued work. A native createImageBitmap operation already
running cannot be interrupted; when its consumer has gone away, its eventual
bitmap is closed instead of entering the cache. Page/session signals also apply
to cropped frame operations. Texture bytes and hashes are still verified; no
rescaling, smoothing, static-animation replacement or skipped integrity checks
are introduced. Image-file lookup is indexed once per Atlas rather than scanning
the whole file manifest for every asset read.

Queued lightweight cases cover foreground reservation, eventual disposal of an
abandoned native decode, and a visible frame completing while speculative I/O
remains blocked. Existing cache sharing, memory, duplicate-frame, priority and
animation cases remain part of the single final test run.
