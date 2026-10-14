import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const update = vi.fn();
vi.mock("@/app/actions/profile", () => ({ updateProfileAction: (...a: unknown[]) => update(...a) }));

import { ProfileForm } from "@/components/dashboard/profile-form";

describe("ProfileForm", () => {
  it("keeps what the user typed when validation fails (no automatic form reset)", async () => {
    update.mockResolvedValue({ ok: false, error: "Please fix the highlighted fields.", fieldErrors: { email: "Enter a valid email address" } });
    const user = userEvent.setup();
    render(<ProfileForm displayName="Asha" email="" />);
    await user.clear(screen.getByLabelText(/Display name/));
    await user.type(screen.getByLabelText(/Display name/), "Asha K");
    await user.type(screen.getByLabelText(/Email/), "not-an-email");
    await user.click(screen.getByRole("button", { name: "Save profile" }));
    expect(await screen.findByText("Enter a valid email address")).toBeInTheDocument();
    expect(screen.getByLabelText(/Display name/)).toHaveValue("Asha K");
    expect(screen.getByLabelText(/Email/)).toHaveValue("not-an-email");
  });

  it("submits the entered values and confirms success", async () => {
    update.mockResolvedValue({ ok: true, message: "Profile saved." });
    const user = userEvent.setup();
    render(<ProfileForm displayName="" email="" />);
    await user.type(screen.getByLabelText(/Display name/), "Ravi");
    await user.click(screen.getByRole("button", { name: "Save profile" }));
    expect(await screen.findByText("Profile saved.")).toBeInTheDocument();
    const fd = update.mock.calls.at(-1)![1] as FormData;
    expect(fd.get("displayName")).toBe("Ravi");
    expect(screen.getByLabelText(/Display name/)).toHaveValue("Ravi");
  });
});
