"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState, useTransition } from "react";
import { publishListingAction, saveListingAction } from "@/app/actions/listings";
import { EMPTY_LISTING_FORM, WIZARD_STEPS, validateListing, type FieldErrors, type ListingFormValues } from "@/lib/validation/listing";
import { Alert, Button, Card, cx } from "@/components/ui";
import { BasicsStep, LocationStep, PricingStep, ReviewStep, RulesStep } from "@/components/wizard/steps";
import { PhotoUploader, type PhotoItem } from "@/components/wizard/photo-uploader";

type Props = {
  listingId: string | null;
  initialValues?: ListingFormValues;
  initialPhotos?: PhotoItem[];
  /** For listings that are already live, saving edits does not change status. */
  status?: "draft" | "published" | "paused";
};

export function ListingWizard({ listingId: initialId, initialValues = EMPTY_LISTING_FORM, initialPhotos = [], status = "draft" }: Props) {
  const router = useRouter();
  const [values, setValues] = useState<ListingFormValues>(initialValues);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [step, setStep] = useState(0);
  const [listingId, setListingId] = useState<string | null>(initialId);
  const [photos, setPhotos] = useState<PhotoItem[]>(initialPhotos);
  const [banner, setBanner] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const heading = useRef<HTMLHeadingElement>(null);
  const live = status !== "draft";

  const set = useCallback(<K extends keyof ListingFormValues>(key: K, value: ListingFormValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  }, []);

  const goTo = (i: number) => {
    setStep(i);
    setBanner(null);
    requestAnimationFrame(() => heading.current?.focus());
  };

  async function save(): Promise<string | null> {
    const res = await saveListingAction({ id: listingId, values });
    if (!res.ok) {
      setBanner({ tone: "error", text: res.error });
      if (res.fieldErrors) setErrors(res.fieldErrors as FieldErrors);
      return null;
    }
    setListingId(res.data!.id);
    return res.data!.id;
  }

  const current = WIZARD_STEPS[step]!;

  const next = () => {
    const found = validateListing(values, current.fields);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setBanner({ tone: "error", text: "Please fix the highlighted fields to continue." });
      return;
    }
    start(async () => {
      if (current.fields.length > 0 && (await save()) === null) return;
      goTo(Math.min(step + 1, WIZARD_STEPS.length - 1));
    });
  };

  const saveDraft = () =>
    start(async () => {
      setBanner(null);
      const id = await save();
      if (id) setBanner({ tone: "success", text: live ? "Changes saved." : "Draft saved. You can come back to finish it any time." });
    });

  const publish = () => {
    const found = validateListing(values);
    setErrors(found);
    const firstBad = WIZARD_STEPS.findIndex((s) => s.fields.some((f) => found[f]));
    if (firstBad !== -1) {
      setBanner({ tone: "error", text: `Some required details are missing in “${WIZARD_STEPS[firstBad]!.title}”.` });
      goTo(firstBad);
      return;
    }
    if (photos.length === 0) {
      setBanner({ tone: "error", text: "Add at least one photo before publishing." });
      goTo(2);
      return;
    }
    start(async () => {
      const id = await save();
      if (!id) return;
      if (live && status === "published") {
        setBanner({ tone: "success", text: "Changes saved." });
        return;
      }
      const res = await publishListingAction(id);
      if (!res.ok) {
        setBanner({ tone: "error", text: res.error });
        return;
      }
      router.push(`/listings/${id}`);
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      <nav aria-label="Progress">
        <ol className="flex flex-wrap gap-2">
          {WIZARD_STEPS.map((s, i) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => (i <= step || listingId) && goTo(i)}
                aria-current={i === step ? "step" : undefined}
                className={cx(
                  "min-h-11 rounded-lg border px-3 text-sm font-medium",
                  i === step ? "border-brand-700 bg-brand-700 text-white" : i < step ? "border-brand-200 bg-brand-50 text-brand-900" : "border-slate-300 bg-white text-slate-700",
                )}
              >
                <span className="mr-1 font-bold">{i + 1}.</span>{s.title}
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <Card className="p-5 sm:p-6">
        <h2 ref={heading} tabIndex={-1} className="mb-4 text-xl font-semibold outline-none">{current.title}</h2>
        {banner && <Alert tone={banner.tone} className="mb-4">{banner.text}</Alert>}

        {current.id === "basics" && <BasicsStep values={values} errors={errors} set={set} />}
        {current.id === "location" && <LocationStep values={values} errors={errors} set={set} />}
        {current.id === "photos" && <PhotoUploader listingId={listingId} photos={photos} onChange={setPhotos} />}
        {current.id === "pricing" && <PricingStep values={values} errors={errors} set={set} />}
        {current.id === "rules" && <RulesStep values={values} errors={errors} set={set} />}
        {current.id === "review" && <ReviewStep values={values} errors={errors} set={set} photoCount={photos.length} />}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <Button variant="secondary" onClick={() => goTo(Math.max(0, step - 1))} disabled={step === 0 || pending}>Back</Button>
          <div className="flex flex-wrap gap-2">
            {listingId && step !== WIZARD_STEPS.length - 1 && <Button variant="ghost" onClick={saveDraft} disabled={pending}>Save draft</Button>}
            {step < WIZARD_STEPS.length - 1 ? (
              <Button onClick={next} disabled={pending}>{pending ? "Saving…" : "Save & continue"}</Button>
            ) : (
              <>
                <Button variant="secondary" onClick={saveDraft} disabled={pending}>{live ? "Save changes" : "Save draft"}</Button>
                {!(live && status === "published") && <Button onClick={publish} disabled={pending}>{pending ? "Publishing…" : status === "paused" ? "Save & resume listing" : "Publish listing"}</Button>}
              </>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
