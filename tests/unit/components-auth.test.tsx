import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const requestOtp = vi.fn();
const verifyOtp = vi.fn();
vi.mock("@/app/actions/auth", () => ({
  requestOtpAction: (...a: unknown[]) => requestOtp(...a),
  verifyOtpAction: (...a: unknown[]) => verifyOtp(...a),
  signOutAction: vi.fn(),
  signOutOthersAction: vi.fn(),
}));

import { PhoneOtpForm } from "@/components/auth/phone-otp-form";
import { getCountryOptions } from "@/lib/auth/phone";

const countries = getCountryOptions();

const sent = (over = {}) => ({ status: "sent", phone: "+919876543210", maskedPhone: "+91 ••••• •3210", sentAt: Date.now(), message: "We asked our SMS provider to send a code to +91 ••••• •3210.", ...over });

beforeEach(() => {
  requestOtp.mockReset();
  verifyOtp.mockReset();
});
afterEach(() => vi.useRealTimers());

describe("PhoneOtpForm", () => {
  it("defaults the country selector to India (+91) and offers other countries", () => {
    render(<PhoneOtpForm countries={countries} />);
    const select = screen.getByLabelText("Country") as HTMLSelectElement;
    expect(select.value).toBe("IN");
    expect(within(select).getByRole("option", { name: /India \(\+91\)/ })).toBeInTheDocument();
    expect(within(select).getByRole("option", { name: /United Kingdom/ })).toBeInTheDocument();
    expect(screen.getByLabelText(/Mobile number/)).toHaveAttribute("type", "tel");
  });

  it("moves to the code step only after the provider confirms the send", async () => {
    requestOtp.mockResolvedValue(sent());
    const user = userEvent.setup();
    render(<PhoneOtpForm next="/listings/abc" countries={countries} />);
    await user.type(screen.getByLabelText(/Mobile number/), "9876543210");
    await user.click(screen.getByRole("button", { name: "Send code" }));

    expect(await screen.findByText("Check your messages")).toBeInTheDocument();
    expect(requestOtp).toHaveBeenCalledTimes(1);
    const fd = requestOtp.mock.calls[0]![1] as FormData;
    expect(fd.get("country")).toBe("IN");
    expect(fd.get("phone")).toBe("9876543210");
    expect(screen.getByLabelText(/6-digit code/)).toHaveAttribute("autocomplete", "one-time-code");
    expect(document.querySelector('input[name="next"]')).toHaveValue("/listings/abc");
  });

  it("shows the setup error and stays on the phone step when the backend/provider isn't configured", async () => {
    requestOtp.mockResolvedValue({ status: "error", kind: "setup", message: "The backend is not configured. Set NEXT_PUBLIC_SUPABASE_URL …" });
    const user = userEvent.setup();
    render(<PhoneOtpForm countries={countries} />);
    await user.type(screen.getByLabelText(/Mobile number/), "9876543210");
    await user.click(screen.getByRole("button", { name: "Send code" }));
    expect(await screen.findByText("Setup required")).toBeInTheDocument();
    expect(screen.getByText(/not configured/)).toBeInTheDocument();
    expect(screen.queryByText("Check your messages")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/6-digit code/)).not.toBeInTheDocument();
  });

  it("does not pretend a code was sent when the SMS provider fails", async () => {
    requestOtp.mockResolvedValue({ status: "error", kind: "provider", message: "The SMS provider rejected or couldn't deliver the message. No code was sent." });
    const user = userEvent.setup();
    render(<PhoneOtpForm countries={countries} />);
    await user.type(screen.getByLabelText(/Mobile number/), "9876543210");
    await user.click(screen.getByRole("button", { name: "Send code" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/No code was sent/);
    expect(screen.queryByText("Check your messages")).not.toBeInTheDocument();
  });

  it("shows an inline validation message for a bad number", async () => {
    requestOtp.mockResolvedValue({ status: "error", kind: "validation", message: "That mobile number doesn't look valid for the selected country." });
    const user = userEvent.setup();
    render(<PhoneOtpForm countries={countries} />);
    await user.type(screen.getByLabelText(/Mobile number/), "123");
    await user.click(screen.getByRole("button", { name: "Send code" }));
    const input = await screen.findByLabelText(/Mobile number/);
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getAllByText(/doesn't look valid/).length).toBeGreaterThan(0);
  });

  it("enforces a resend cooldown with a visible countdown, then enables resend", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ["Date", "setInterval", "clearInterval"] });
    const start = Date.now();
    requestOtp.mockResolvedValue(sent({ sentAt: start }));
    const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
    render(<PhoneOtpForm countries={countries} />);
    await user.type(screen.getByLabelText(/Mobile number/), "9876543210");
    await user.click(screen.getByRole("button", { name: "Send code" }));
    await screen.findByText("Check your messages");

    const resend = screen.getByRole("button", { name: "Resend code" });
    expect(resend).toBeDisabled();
    expect(screen.getByText(/request a new code in \d+s/)).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(61_000);
    });
    expect(screen.getByRole("button", { name: "Resend code" })).toBeEnabled();
  });

  it("shows a clear error for a wrong code and keeps the code form", async () => {
    requestOtp.mockResolvedValue(sent());
    verifyOtp.mockResolvedValue(sent({ message: "That code is incorrect or has expired. Check the SMS or request a new code." }));
    const user = userEvent.setup();
    render(<PhoneOtpForm countries={countries} />);
    await user.type(screen.getByLabelText(/Mobile number/), "9876543210");
    await user.click(screen.getByRole("button", { name: "Send code" }));
    await user.type(await screen.findByLabelText(/6-digit code/), "000000");
    await user.click(screen.getByRole("button", { name: "Verify and continue" }));
    expect(await screen.findByText(/incorrect or has expired/)).toBeInTheDocument();
    expect(screen.getByLabelText(/6-digit code/)).toHaveAttribute("aria-invalid", "true");
    const fd = verifyOtp.mock.calls[0]![1] as FormData;
    expect(fd.get("token")).toBe("000000");
    expect(fd.get("phone")).toBe("+919876543210");
  });
});
