"use client";

import { useState } from "react";

import { addSelectedOffers } from "@/app/actions";
import type { Offer } from "@/src/domain/offer";

type OfferPickerProps = {
  offers: Offer[];
  selectedOfferIds: string[];
};

export function OfferPicker({ offers, selectedOfferIds }: OfferPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [pendingOfferIds, setPendingOfferIds] = useState<string[]>([]);
  const [inspectingOfferId, setInspectingOfferId] = useState<string | null>(null);
  const selectedCount = selectedOfferIds.length;
  const pendingCount = pendingOfferIds.filter((offerId) => !selectedOfferIds.includes(offerId)).length;
  const inspectingOffer = offers.find((offer) => offer.id === inspectingOfferId);
  const panelId = "offer-picker-panel";

  function togglePending(offerId: string, alreadySelected: boolean) {
    if (alreadySelected) {
      return;
    }
    setPendingOfferIds((current) =>
      current.includes(offerId)
        ? current.filter((id) => id !== offerId)
        : [...current, offerId],
    );
  }

  return (
    <div className="choice-picker">
      <button
        className="button button-quiet picker-toggle"
        type="button"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => setIsOpen((open) => !open)}
      >
        Choose advertiser links
      </button>
      <p className="picker-summary">
        {selectedCount} {selectedCount === 1 ? "advertiser link" : "advertiser links"} in the newsletter
      </p>
      <p className="field-help">{offers.length} sample advertiser offers available</p>

      {isOpen ? (
        <div id={panelId} className="picker-panel">
          <form
            action={async (formData) => {
              await addSelectedOffers(formData);
              setPendingOfferIds([]);
              setInspectingOfferId(null);
              setIsOpen(false);
            }}
          >
            <ul className="picker-row-list">
              {offers.map((offer) => {
                const alreadySelected = selectedOfferIds.includes(offer.id);
                const checked = alreadySelected || pendingOfferIds.includes(offer.id);
                return (
                  <li key={offer.id} className="picker-row">
                    <label className={`picker-choice${alreadySelected ? " is-disabled" : ""}`}>
                      <input
                        type="checkbox"
                        name="offerId"
                        value={offer.id}
                        checked={checked}
                        disabled={alreadySelected}
                        onChange={() => togglePending(offer.id, alreadySelected)}
                      />
                      <span>{offer.advertiserName} — {offer.offerName}</span>
                    </label>
                    <button
                      className="small-button"
                      type="button"
                      onClick={() =>
                        setInspectingOfferId((current) => (current === offer.id ? null : offer.id))
                      }
                      aria-expanded={inspectingOfferId === offer.id}
                    >
                      View
                    </button>
                  </li>
                );
              })}
            </ul>
            <button
              className="button button-primary prepare-button"
              type="submit"
              disabled={pendingCount === 0}
            >
              Add selected links ({pendingCount})
            </button>
          </form>

          {inspectingOffer ? (
            <article className="story-detail-card offer-detail-card">
              <span className="story-detail-label">Selected offer information</span>
              <h3>{inspectingOffer.offerName}</h3>
              <dl className="offer-metadata">
                <div>
                  <dt>Advertiser</dt>
                  <dd>{inspectingOffer.advertiserName}</dd>
                </div>
                <div>
                  <dt>Offer</dt>
                  <dd>{inspectingOffer.offerName}</dd>
                </div>
                <div>
                  <dt>Sample tracking URL</dt>
                  <dd><code>{inspectingOffer.trackingUrl}</code></dd>
                </div>
              </dl>
            </article>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
