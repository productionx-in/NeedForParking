import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }), usePathname: () => "/", redirect: vi.fn(), notFound: vi.fn() }));

const saveListing = vi.fn();
const publishListing = vi.fn();
const prepareUpload = vi.fn();
const registerPhoto = vi.fn();
const deletePhoto = vi.fn();
const setStatus = vi.fn();
vi.mock("@/app/actions/listings", () => ({
  saveListingAction: (...a: unknown[]) => saveListing(...a),
  publishListingAction: (...a: unknown[]) => publishListing(...a),
  prepareUploadAction: (...a: unknown[]) => prepareUpload(...a),
  registerPhotoAction: (...a: unknown[]) => registerPhoto(...a),
  deletePhotoAction: (...a: unknown[]) => deletePhoto(...a),
  setListingStatusAction: (...a: unknown[]) => setStatus(...a),
}));
const createRequest = vi.fn();
const respond = vi.fn();
const cancel = vi.fn();
const complete = vi.fn();
vi.mock("@/app/actions/requests", () => ({
  createRequestAction: (...a: unknown[]) => createRequest(...a),
  respondToRequestAction: (...a: unknown[]) => respond(...a),
  cancelRequestAction: (...a: unknown[]) => cancel(...a),
  completeRequestAction: (...a: unknown[]) => complete(...a),
}));
const getSession = vi.fn(async () => ({ data: { session: { access_token: "jwt-token" } } }));
vi.mock("@/lib/supabase/client", () => ({ getBrowserClient: () => ({ auth: { getSession } }) }));
const report = vi.fn();
vi.mock("@/app/actions/engagement", () => ({ reportListingAction: (...a: unknown[]) => report(...a), toggleFavoriteAction: vi.fn() }));

import { ListingWizard } from "@/components/wizard/listing-wizard";
import { PhotoUploader } from "@/components/wizard/photo-uploader";
import { RequestForm } from "@/components/listing/request-form";
import { ListingCard } from "@/components/listing/listing-card";
import { ReportForm } from "@/components/listing/report-form";
import { IncomingRequestCard, MyRequestCard } from "@/components/dashboard/request-cards";
import { EMPTY_LISTING_FORM, type ListingFormValues } from "@/lib/validation/listing";
import { todayIST } from "@/lib/domain/format";
import type { RequestRow, SearchRow } from "@/lib/types";

const LISTING = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  for (const f of [push, refresh, saveListing, publishListing, prepareUpload, registerPhoto, deletePhoto, setStatus, createRequest, respond, cancel, complete, report]) f.mockReset();
});

const completeValues: ListingFormValues = {
  ...EMPTY_LISTING_FORM,
  title: "Covered bay near Inorbit",
  description: "A covered car parking bay in a gated community, available on weekdays.",
  vehicleTypes: ["car"],
  coverType: "covered",
  addressLine: "Fictional Towers, Test Road",
  locality: "Madhapur",
  postalCode: "500081",
  latitude: "17.4486",
  longitude: "78.3908",
  rentalType: "monthly",
  priceInr: "3500",
  ownerDeclaration: true,
  permissionStatus: "obtained",
};

describe("ListingWizard", () => {
  it("blocks the first step until mandatory fields are valid, and explains why", async () => {
    const user = userEvent.setup();
    render(<ListingWizard listingId={null} />);
    await user.click(screen.getByRole("button", { name: "Save & continue" }));
    expect(saveListing).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/Listing title/)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText(/Title must be at least 5 characters/)).toBeInTheDocument();
    expect(screen.getByText("Choose at least one vehicle type")).toBeInTheDocument();
    expect(screen.getByText("Choose covered or open parking")).toBeInTheDocument();
    expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
  });

  it("saves a draft on valid basics, then moves to the location step", async () => {
    saveListing.mockResolvedValue({ ok: true, data: { id: LISTING } });
    const user = userEvent.setup();
    render(<ListingWizard listingId={null} />);
    await user.type(screen.getByLabelText(/Listing title/), "Covered bay near Inorbit");
    await user.type(screen.getByLabelText(/^Description/), "A covered car parking bay in a gated community.");
    await user.click(screen.getByLabelText("Car"));
    await user.click(screen.getByLabelText("Covered"));
    await user.click(screen.getByRole("button", { name: "Save & continue" }));
    expect(await screen.findByRole("heading", { name: "Location" })).toBeInTheDocument();
    expect(saveListing).toHaveBeenCalledWith({ id: null, values: expect.objectContaining({ title: "Covered bay near Inorbit", vehicleTypes: ["car"], coverType: "covered" }) });
  });

  it("validates the location step (PIN, coordinates) and degrades gracefully without a map key", async () => {
    const user = userEvent.setup();
    render(<ListingWizard listingId={LISTING} initialValues={{ ...completeValues, postalCode: "123", latitude: "", longitude: "" }} />);
    await user.click(screen.getByRole("button", { name: /^2\.\s*Location/ }));
    expect(screen.getByText("Map unavailable")).toBeInTheDocument();
    expect(screen.getByLabelText(/Latitude/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save & continue" }));
    expect(saveListing).not.toHaveBeenCalled();
    expect(screen.getByText("Enter a valid 6-digit PIN code")).toBeInTheDocument();
    expect(screen.getAllByText(/Place the pin on the map/).length).toBe(2);
    // private by default
    expect(screen.getByLabelText(/Approximate area/)).toBeChecked();
    expect(screen.getByLabelText(/Also show my full address publicly/)).not.toBeChecked();
  });

  it("validates price and availability step", async () => {
    const user = userEvent.setup();
    render(<ListingWizard listingId={LISTING} initialValues={{ ...completeValues, priceInr: "-5", rentalType: "", availableDays: [] }} />);
    await user.click(screen.getByRole("button", { name: /^4\.\s*Price/ }));
    await user.click(screen.getByRole("button", { name: "Save & continue" }));
    expect(saveListing).not.toHaveBeenCalled();
    expect(screen.getByText("Choose hourly, daily or monthly")).toBeInTheDocument();
    expect(screen.getByText(/Price must be a number/)).toBeInTheDocument();
    expect(screen.getByText("Choose at least one available day")).toBeInTheDocument();
  });

  it("refuses to publish without a photo and sends the user to the photo step", async () => {
    const user = userEvent.setup();
    render(<ListingWizard listingId={LISTING} initialValues={completeValues} initialPhotos={[]} />);
    await user.click(screen.getByRole("button", { name: /^6\.\s*Review/ }));
    await user.click(screen.getByRole("button", { name: "Publish listing" }));
    expect(saveListing).not.toHaveBeenCalled();
    expect(publishListing).not.toHaveBeenCalled();
    expect(await screen.findByText("Add at least one photo before publishing.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Photos" })).toBeInTheDocument();
  });

  it("refuses to publish without the ownership declaration", async () => {
    const user = userEvent.setup();
    render(<ListingWizard listingId={LISTING} initialValues={{ ...completeValues, ownerDeclaration: false, permissionStatus: "unconfirmed" }} initialPhotos={[{ id: "p1", storage_path: "a/b/c.jpg" }]} />);
    await user.click(screen.getByRole("button", { name: /^6\.\s*Review/ }));
    await user.click(screen.getByRole("button", { name: "Publish listing" }));
    expect(publishListing).not.toHaveBeenCalled();
    expect(await screen.findByText("You must confirm you own or are authorized to offer this space")).toBeInTheDocument();
    expect(screen.getByText("Confirm the property/community permission status")).toBeInTheDocument();
  });

  it("saves then publishes a complete listing and navigates to it", async () => {
    saveListing.mockResolvedValue({ ok: true, data: { id: LISTING } });
    publishListing.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<ListingWizard listingId={LISTING} initialValues={completeValues} initialPhotos={[{ id: "p1", storage_path: "a/b/c.jpg" }]} />);
    await user.click(screen.getByRole("button", { name: /^6\.\s*Review/ }));
    await user.click(screen.getByRole("button", { name: "Publish listing" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/listings/${LISTING}`));
    expect(saveListing).toHaveBeenCalledTimes(1);
    expect(publishListing).toHaveBeenCalledWith(LISTING);
  });

  it("shows server-side publish errors instead of navigating", async () => {
    saveListing.mockResolvedValue({ ok: true, data: { id: LISTING } });
    publishListing.mockResolvedValue({ ok: false, error: "Fix these before publishing: address." });
    const user = userEvent.setup();
    render(<ListingWizard listingId={LISTING} initialValues={completeValues} initialPhotos={[{ id: "p1", storage_path: "a/b/c.jpg" }]} />);
    await user.click(screen.getByRole("button", { name: /^6\.\s*Review/ }));
    await user.click(screen.getByRole("button", { name: "Publish listing" }));
    expect(await screen.findByText("Fix these before publishing: address.")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("offers 'Save changes' (not 'Publish') for an already-published listing", async () => {
    saveListing.mockResolvedValue({ ok: true, data: { id: LISTING } });
    const user = userEvent.setup();
    render(<ListingWizard listingId={LISTING} initialValues={completeValues} initialPhotos={[{ id: "p1", storage_path: "a/b/c.jpg" }]} status="published" />);
    await user.click(screen.getByRole("button", { name: /^6\.\s*Review/ }));
    expect(screen.queryByRole("button", { name: /Publish listing/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Changes saved.")).toBeInTheDocument();
  });
});

describe("PhotoUploader", () => {
  it("asks the user to save earlier steps first when there is no draft yet", () => {
    render(<PhotoUploader listingId={null} photos={[]} onChange={vi.fn()} />);
    expect(screen.getByText(/Save the previous steps first/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Choose photos")).not.toBeInTheDocument();
  });

  it("rejects unsupported types and oversized files client-side, without any network call", async () => {
    const user = userEvent.setup({ applyAccept: false });
    render(<PhotoUploader listingId={LISTING} photos={[]} onChange={vi.fn()} />);
    const input = document.getElementById("photo-input") as HTMLInputElement;
    await user.upload(input, [
      new File(["x"], "doc.pdf", { type: "application/pdf" }),
      new File(["x"], "anim.gif", { type: "image/gif" }),
      new File([new ArrayBuffer(5 * 1024 * 1024 + 1)], "huge.jpg", { type: "image/jpeg" }),
    ]);
    expect(await screen.findAllByRole("alert")).toHaveLength(3);
    expect(screen.getAllByText(/Only JPEG, PNG or WebP/, { selector: "p" })).toHaveLength(2);
    expect(screen.getByText(/smaller than 5 MB/)).toBeInTheDocument();
    expect(prepareUpload).not.toHaveBeenCalled();
  });

  it("enforces the 10-photo limit", async () => {
    const photos = Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, storage_path: `u/l/${i}.jpg` }));
    const user = userEvent.setup();
    render(<PhotoUploader listingId={LISTING} photos={photos} onChange={vi.fn()} />);
    await user.upload(document.getElementById("photo-input") as HTMLInputElement, new File(["x"], "11.jpg", { type: "image/jpeg" }));
    expect(await screen.findByText(/at most 10 photos/)).toBeInTheDocument();
    expect(prepareUpload).not.toHaveBeenCalled();
  });

  it("uploads with the user's JWT, shows progress, then registers the photo", async () => {
    prepareUpload.mockResolvedValue({ ok: true, data: { path: `u1/${LISTING}/abc.jpg` } });
    registerPhoto.mockResolvedValue({ ok: true, data: { id: "photo-1" } });
    const sent: { url?: string; headers: Record<string, string>; body?: FormData } = { headers: {} };
    class FakeXHR {
      upload: { onprogress?: (e: ProgressEvent) => void } = {};
      onload?: () => void;
      onerror?: () => void;
      status = 200;
      open(_m: string, url: string) { sent.url = url; }
      setRequestHeader(k: string, v: string) { sent.headers[k] = v; }
      send(body: FormData) {
        sent.body = body;
        queueMicrotask(() => {
          this.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 } as ProgressEvent);
          this.onload?.();
        });
      }
    }
    vi.stubGlobal("XMLHttpRequest", FakeXHR);
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<PhotoUploader listingId={LISTING} photos={[]} onChange={onChange} />);
    await user.upload(document.getElementById("photo-input") as HTMLInputElement, new File(["abc"], "bay.jpg", { type: "image/jpeg" }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith([{ id: "photo-1", storage_path: `u1/${LISTING}/abc.jpg` }]));
    expect(sent.headers.Authorization).toBe("Bearer jwt-token");
    expect(sent.headers["x-upsert"]).toBe("false");
    expect(sent.url).toContain(`/storage/v1/object/listing-photos/u1/${LISTING}/abc.jpg`);
    expect(await screen.findByText("Uploaded")).toBeInTheDocument();
    expect(registerPhoto).toHaveBeenCalledWith({ listingId: LISTING, path: `u1/${LISTING}/abc.jpg` });
    vi.unstubAllGlobals();
  });

  it("reports a failed upload (e.g. storage policy rejection) and does not register the photo", async () => {
    prepareUpload.mockResolvedValue({ ok: true, data: { path: `u1/${LISTING}/abc.jpg` } });
    class DeniedXHR {
      upload = {};
      onload?: () => void;
      onerror?: () => void;
      status = 403;
      open() {}
      setRequestHeader() {}
      send() { queueMicrotask(() => this.onload?.()); }
    }
    vi.stubGlobal("XMLHttpRequest", DeniedXHR);
    const user = userEvent.setup();
    render(<PhotoUploader listingId={LISTING} photos={[]} onChange={vi.fn()} />);
    await user.upload(document.getElementById("photo-input") as HTMLInputElement, new File(["abc"], "bay.png", { type: "image/png" }));
    expect(await screen.findByText(/aren't allowed to upload/)).toBeInTheDocument();
    expect(registerPhoto).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe("RequestForm", () => {
  const fill = (over: Record<string, string> = {}) => {
    const v = { start: "2099-03-02", end: "2099-03-03", message: "Hello, could I park here next week?", ...over };
    fireEvent.change(screen.getByLabelText(/Start date/), { target: { value: v.start } });
    fireEvent.change(screen.getByLabelText(/^End date/), { target: { value: v.end } });
    fireEvent.change(screen.getByLabelText(/Message to the owner/), { target: { value: v.message } });
  };

  it("prevents past dates in the picker and validates invalid ranges before submitting", async () => {
    const user = userEvent.setup();
    render(<RequestForm listingId={LISTING} vehicleTypes={["car", "motorcycle"]} availableDays={[1, 2, 3, 4, 5]} />);
    expect(screen.getByLabelText(/Start date/)).toHaveAttribute("min", todayIST());
    fill({ start: "2099-03-05", end: "2099-03-01" });
    await user.click(screen.getByRole("button", { name: "Send request" }));
    expect(createRequest).not.toHaveBeenCalled();
    expect(await screen.findByText("End date must be on or after the start date")).toBeInTheDocument();
  });

  it("flags empty fields, short messages and a half-filled time window", async () => {
    const user = userEvent.setup();
    render(<RequestForm listingId={LISTING} vehicleTypes={["car"]} availableDays={[1]} />);
    fireEvent.change(screen.getByLabelText(/From/), { target: { value: "10:00" } });
    await user.click(screen.getByRole("button", { name: "Send request" }));
    expect(createRequest).not.toHaveBeenCalled();
    expect(screen.getByText("Choose a date", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByText(/at least 5 characters/)).toBeInTheDocument();
    expect(screen.getByText("Set both start and end time, or neither")).toBeInTheDocument();
  });

  it("only offers vehicle types the listing accepts, and disables unavailable weekdays for recurring requests", async () => {
    const user = userEvent.setup();
    render(<RequestForm listingId={LISTING} vehicleTypes={["motorcycle"]} availableDays={[1, 2]} />);
    const vehicle = screen.getByLabelText(/Your vehicle/) as HTMLSelectElement;
    expect([...vehicle.options].map((o) => o.value)).toEqual(["motorcycle"]);
    await user.click(screen.getByLabelText("Recurring"));
    expect(screen.getByLabelText("Mon")).toBeEnabled();
    expect(screen.getByLabelText("Sun")).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Send request" }));
    expect(screen.getByText("Choose at least one day of the week")).toBeInTheDocument();
  });

  it("submits a valid request and confirms", async () => {
    createRequest.mockResolvedValue({ ok: true, message: "Request sent. The owner will review it." });
    const user = userEvent.setup();
    render(<RequestForm listingId={LISTING} vehicleTypes={["car"]} availableDays={[1, 2, 3, 4, 5]} />);
    fill();
    await user.click(screen.getByRole("button", { name: "Send request" }));
    expect(await screen.findByText("Request sent")).toBeInTheDocument();
    expect(createRequest).toHaveBeenCalledWith(expect.objectContaining({ listingId: LISTING, startDate: "2099-03-02", endDate: "2099-03-03", vehicleType: "car", scheduleType: "one_time" }));
  });

  it("shows database rejections (e.g. overlap) without losing the form", async () => {
    createRequest.mockResolvedValue({ ok: false, error: "Those dates and times are already taken by an accepted request." });
    const user = userEvent.setup();
    render(<RequestForm listingId={LISTING} vehicleTypes={["car"]} availableDays={[1, 2, 3, 4, 5]} />);
    fill();
    await user.click(screen.getByRole("button", { name: "Send request" }));
    expect(await screen.findByText(/already taken/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Message to the owner/)).toHaveValue("Hello, could I park here next week?");
  });
});

const row = (over: Partial<SearchRow> = {}): SearchRow => ({
  id: LISTING, title: "Covered bay near Inorbit", locality: "Madhapur", city: "Hyderabad", vehicle_types: ["car"], cover_type: "covered", rental_type: "monthly",
  price_inr: "3500.00", min_duration: 1, deposit_inr: "0", available_days: [1, 2, 3, 4, 5], available_from: "08:00:00", available_to: "20:00:00", access_24h: false,
  overnight_allowed: false, latitude: 17.45, longitude: 78.39, location_privacy: "approximate", is_demo: false, created_at: "2026-01-01T00:00:00Z", cover_photo_path: null,
  is_open_now: true, distance_m: null, total_count: 1, ...over,
});

describe("ListingCard", () => {
  it("shows price, locality, hours, availability and links to the listing", () => {
    render(<ListingCard listing={row()} />);
    expect(screen.getByRole("link", { name: "Covered bay near Inorbit" })).toHaveAttribute("href", `/listings/${LISTING}`);
    expect(screen.getByText(/₹3,500/)).toBeInTheDocument();
    expect(screen.getByText(/Madhapur, Hyderabad/)).toBeInTheDocument();
    expect(screen.getByText("Mon – Fri")).toBeInTheDocument();
    expect(screen.getByText(/8:00 AM – 8:00 PM/)).toBeInTheDocument();
    expect(screen.getByText("Available now (IST)")).toBeInTheDocument();
    expect(screen.getByText("Approximate location")).toBeInTheDocument();
    expect(screen.queryByText(/DEMO DATA/)).not.toBeInTheDocument();
    expect(screen.getByText("No photo yet")).toBeInTheDocument();
  });
  it("clearly labels demo listings", () => {
    render(<ListingCard listing={row({ is_demo: true })} />);
    expect(screen.getByText(/DEMO DATA/)).toBeInTheDocument();
  });
  it("shows walking distance in metres when close, kilometres when far", () => {
    const { unmount } = render(<ListingCard listing={row({ distance_m: 184 })} />);
    expect(screen.getByText(/~180 m away/)).toBeInTheDocument();
    unmount();
    render(<ListingCard listing={row({ distance_m: 1234 })} />);
    expect(screen.getByText(/1\.2 km away/)).toBeInTheDocument();
  });
});

describe("ReportForm", () => {
  it("submits a report with the chosen reason", async () => {
    report.mockResolvedValue({ ok: true, message: "Thanks — your report was sent to our moderators." });
    const user = userEvent.setup();
    render(<ReportForm listingId={LISTING} />);
    await user.click(screen.getByText("Report this listing"));
    await user.selectOptions(screen.getByLabelText(/Reason/), "scam");
    await user.type(screen.getByLabelText(/Details/), "Asked for money upfront");
    await user.click(screen.getByRole("button", { name: "Send report" }));
    expect(await screen.findByText(/report was sent/)).toBeInTheDocument();
    expect(report).toHaveBeenCalledWith({ listingId: LISTING, reason: "scam", details: "Asked for money upfront" });
  });
});

const req = (over: Partial<RequestRow> = {}): RequestRow => ({
  id: "r1", listing_id: LISTING, status: "pending", schedule_type: "one_time", start_date: "2099-03-02", end_date: "2099-03-03", start_time: null, end_time: null,
  recurring_days: null, vehicle_type: "car", message: "Hi there", owner_response: null, responded_at: null, created_at: "2026-01-01T00:00:00Z",
  listing_title: "Covered bay", listing_locality: "Madhapur", listing_status: "published", listing_is_demo: false, other_party_name: "Asha", ...over,
});

describe("request cards", () => {
  it("lets owners accept or decline pending requests with an optional reply", async () => {
    respond.mockResolvedValue({ ok: true, message: "Request accepted." });
    const user = userEvent.setup();
    render(<IncomingRequestCard r={req()} />);
    expect(screen.getByText("Pending")).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Reply/), "Welcome!");
    await user.click(screen.getByRole("button", { name: "Accept" }));
    expect(respond).toHaveBeenCalledWith({ requestId: "r1", decision: "accepted", response: "Welcome!" });
    expect(await screen.findByText("Request accepted.")).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
  });
  it("offers no actions on terminal requests", () => {
    for (const status of ["declined", "cancelled", "completed"] as const) {
      const { unmount } = render(<IncomingRequestCard r={req({ status })} />);
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
      unmount();
    }
  });
  it("only lets owners complete an accepted rental once it has started", () => {
    render(<IncomingRequestCard r={req({ status: "accepted", start_date: "2099-03-02" })} />);
    expect(screen.getByRole("button", { name: /once it starts/ })).toBeDisabled();
  });
  it("lets requesters cancel pending/accepted requests only", async () => {
    cancel.mockResolvedValue({ ok: true, message: "Request cancelled." });
    const user = userEvent.setup();
    const { unmount } = render(<MyRequestCard r={req()} />);
    await user.click(screen.getByRole("button", { name: "Cancel request" }));
    expect(cancel).toHaveBeenCalledWith("r1");
    unmount();
    render(<MyRequestCard r={req({ status: "declined", owner_response: "Not available" })} />);
    expect(screen.queryByRole("button", { name: "Cancel request" })).not.toBeInTheDocument();
    expect(screen.getByText("Not available")).toBeInTheDocument();
  });
  it("points accepted requesters to the access details", () => {
    render(<MyRequestCard r={req({ status: "accepted" })} />);
    const link = screen.getByRole("link", { name: "Open the listing" });
    expect(link).toHaveAttribute("href", `/listings/${LISTING}`);
    expect(within(link.closest("[role=status]")!).getByText(/Accepted/)).toBeInTheDocument();
  });
});
