# Current vs Future DB Schema Representation

## Best Representation Approach
The best way to present this is not a single raw ERD with every collection on it. That becomes unreadable and does not show intent.

Use a **3-layer representation**:

1. **Current-state grouped schema map**
- group collections by domain
- show the live source-of-truth collections
- separate master data, transaction data, and event/snapshot layers

2. **Delta overlay**
- clearly mark which collections are:
  - `Keep`
  - `Extend`
  - `Add new`
  - `Project / adapter only`
- this is the most important view for explaining additive evolution and backward compatibility

3. **Future-state kernel map**
- show the new kernel collections at the center
- show how legacy audit collections attach to the kernel through `caseId`, `taskId`, `subjectRef`, and event/signature/retention layers

## Why This Is Better Than a Single ERD
A single ERD answers “what exists,” but it does not answer:
- what stays unchanged
- what gets extended
- what is new
- how backward compatibility is preserved
- how legacy audits map into the future runtime

For stakeholder, IT, and product discussions, the best visual is:
- **Before** on the left
- **Migration / Delta** in the center
- **After** on the right

That format shows both architecture and change strategy.

## Recommended Visual Rules
Use four visual categories:
- `Blue`: current collections kept as-is
- `Amber`: current collections extended additively
- `Green`: new kernel collections
- `Purple dashed links`: projection / compatibility path

## How To Read The Diagram
### Current state
Read left to right by domain:
- identity / tenancy
- supplier / site / product master
- legacy GMP audit transaction core
- evidence / DocVault
- compliance / reporting / CAPA
- tracking / notifications
- additive org and marketplace layers

### Delta strategy
Middle column shows the migration rule:
- keep master/reference collections
- extend legacy transaction collections with kernel linkage fields
- add kernel runtime collections in parallel
- keep old APIs/UI reading legacy collections during migration

### Future state
Right side shows the target:
- workflow types define the runtime
- cases become the generic workflow root
- tasks become normalized work items
- parties and role bindings generalize participation
- signatures, retention, legal holds, and audit events become kernel services
- legacy audit collections remain but attach to the kernel

## Recommended Use In Presentations
Use this combined visual as the primary architecture slide.
Then support it with:
1. `current-db-erd.mmd` for current-state detail
2. `future-eqms-erd.mmd` for target-state detail
3. `gmp-audit-sequence.mmd` for current process behavior

## Deliverable Created
- `docs/eqms-current-vs-future-schema-visual.mmd`

That Mermaid file is the best single-file representation of:
- current collections
- future collections
- additive change model
- backward compatibility path
