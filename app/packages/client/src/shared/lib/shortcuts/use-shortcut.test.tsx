import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { useShortcut } from "./use-shortcut.ts";

const Probe = ({ onMod, onPlain }: { onMod: () => void; onPlain: () => void }) => {
  useShortcut({ key: "k", onTrigger: onMod });
  useShortcut({ key: "?", mod: false, onTrigger: onPlain });
  return <input aria-label="Campo" />;
};

describe("useShortcut", () => {
  it("fires modifier shortcuts everywhere and single keys only outside editable fields", async () => {
    const onMod = vi.fn();
    const onPlain = vi.fn();
    const user = userEvent.setup();
    render(<Probe onMod={onMod} onPlain={onPlain} />);
    await user.keyboard("?");
    expect(onPlain).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("textbox", { name: "Campo" }));
    await user.keyboard("?{Control>}k{/Control}");
    expect(onPlain).toHaveBeenCalledTimes(1);
    expect(onMod).toHaveBeenCalledTimes(1);
    await user.keyboard("{Control>}{Shift>}k{/Shift}{/Control}");
    expect(onMod).toHaveBeenCalledTimes(1);
  });
});
