/** Tutorial by doing (MASTERPLAN §5.6): one short hint per step. */
export const TUTORIAL_STEPS = [
  { id: 'read_letter', hint: "Read Uncle Ray's letter. Press M for your mailbox." },
  { id: 'open_box', hint: 'Open the box by the garage door. Walk up to it and press E.' },
  {
    id: 'install_cpu',
    hint: 'Walk to the rig in the field and install the CPU. Press E in front of it.',
  },
  { id: 'power_on', hint: 'Switch the rig on. The LED goes yellow while it boots, then green.' },
  { id: 'clean', hint: 'The rig is dusty. Wipe it with your cloth.' },
  { id: 'sleep', hint: 'Great work! Go to bed: walk to the garage door and press E.' },
  { id: 'claim', hint: 'Good morning! Your rig is ready. Claim the harvest.' },
] as const;

export type TutorialStepId = (typeof TUTORIAL_STEPS)[number]['id'];
export const TUTORIAL_DONE = TUTORIAL_STEPS.length;

export function tutorialStepIndex(id: TutorialStepId): number {
  return TUTORIAL_STEPS.findIndex((s) => s.id === id);
}
