## 2024-05-24 - Add ARIA role and label to interrogation choices
**Learning:** Found a button container `interrogation__choices` in `EnforcerInterrogationModal.tsx` lacking `role="group"` and an `aria-label`, unlike the analogous `InterrogationTerminal.tsx`. This impacts screen reader users trying to understand the context of the grouped options.
**Action:** When creating new components that mirror existing ones, always check the original for accessibility attributes to ensure parity.
