"use client";

import { useState } from "react";

import { addOffer } from "@/app/actions";
import type { Offer } from "@/src/domain/offer";

type OfferPickerProps = {
  offers: Offer[];
  selectedOfferIds: string[];
};

export function OfferPicker({ offers, selectedOfferIds }: OfferPickerProps) {
  const [offerId, setOfferId] = useState("");
  const selectedOffer = offers.find((offer) => offer.id === offerId);
  const isAlreadySelected = selectedOffer ? selectedOfferIds.includes(selectedOffer.id) : false;

  return (
    <div className="offer-picker">
      <div className="field-group">
        <label htmlFor="offer-picker">Advertiser / offer</label>
        <select
          id="offer-picker"
          value={offerId}
          onChange={(event) => setOfferId(event.target.value)}
        >
          <option value="">Select an advertiser offer</option>
          {offers.map((offer) => (
            <option key={offer.id} value={offer.id}>
              {offer.advertiserName} — {offer.offerName}
            </option>
          ))}
        </select>
        <p className="field-help">{offers.length} sample advertiser offers available</p>
      </div>

      {!selectedOffer ? (
        <div className="story-picker-placeholder">
          <p>Select an advertiser offer to inspect it before adding the tracking link.</p>
        </div>
      ) : (
        <article className="story-detail-card offer-detail-card">
          <span className="story-detail-label">Selected offer information</span>
          <h3>{selectedOffer.offerName}</h3>
          <dl className="offer-metadata">
            <div>
              <dt>Advertiser</dt>
              <dd>{selectedOffer.advertiserName}</dd>
            </div>
            <div>
              <dt>Offer</dt>
              <dd>{selectedOffer.offerName}</dd>
            </div>
            <div>
              <dt>Sample tracking URL</dt>
              <dd><code>{selectedOffer.trackingUrl}</code></dd>
            </div>
          </dl>
          <form action={addOffer}>
            <input type="hidden" name="offerId" value={selectedOffer.id} />
            <button className="button button-primary" type="submit" disabled={isAlreadySelected}>
              {isAlreadySelected ? "Already added" : "Add advertiser link"}
            </button>
          </form>
        </article>
      )}
    </div>
  );
}
