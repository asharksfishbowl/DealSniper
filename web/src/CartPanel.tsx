import { useMemo, useState } from "react";
import { buildAmazonCartUrl } from "./cart";
import type { Deal } from "./types";

type Props = {
  items: Deal[];
  open: boolean;
  onClose: () => void;
  onRemove: (id: number) => void;
  onClear: () => void;
};

const TAG_KEY = "dealsniper_amazon_associate_tag";

function storeLabel(retailer: string): string {
  if (retailer === "homedepot") return "HOME DEPOT";
  return retailer.toUpperCase();
}

export function CartPanel({ items, open, onClose, onRemove, onClear }: Props) {
  const [associateTag, setAssociateTag] = useState(
    () => localStorage.getItem(TAG_KEY) ?? import.meta.env.VITE_AMAZON_ASSOCIATE_TAG ?? "",
  );
  const groups = useMemo(() => {
    const grouped = new Map<string, Deal[]>();
    for (const item of items) {
      grouped.set(item.retailer, [...(grouped.get(item.retailer) ?? []), item]);
    }
    return [...grouped.entries()];
  }, [items]);
  const amazonUrl = buildAmazonCartUrl(items, associateTag);

  if (!open) return null;

  const updateAssociateTag = (value: string) => {
    setAssociateTag(value);
    localStorage.setItem(TAG_KEY, value);
  };

  return (
    <div className="cart-overlay" onClick={onClose} role="presentation">
      <aside
        className="cart-panel"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-label="DealSniper cart"
      >
        <div className="cart-head">
          <div>
            <h2>CART</h2>
            <p>{items.length} saved item{items.length === 1 ? "" : "s"}</p>
          </div>
          <button type="button" className="ghost" onClick={onClose}>
            CLOSE
          </button>
        </div>

        {!items.length ? (
          <p className="cart-empty">Add deals from the board to group them by store.</p>
        ) : (
          <>
            {groups.map(([retailer, storeItems]) => (
              <section className="cart-store" key={retailer}>
                <div className="cart-store-head">
                  <h3>{storeLabel(retailer)}</h3>
                  <span>{storeItems.length} ITEM{storeItems.length === 1 ? "" : "S"}</span>
                </div>
                {storeItems.map((item) => (
                  <div className="cart-item" key={item.id}>
                    <div>
                      <a href={item.url ?? undefined} target="_blank" rel="noopener noreferrer">
                        {item.title}
                      </a>
                      <small>
                        ${item.price.toFixed(2)} · {item.pct_off.toFixed(1)}% off
                      </small>
                    </div>
                    <button type="button" onClick={() => onRemove(item.id)}>
                      REMOVE
                    </button>
                  </div>
                ))}

                {retailer === "amazon" ? (
                  <div className="amazon-checkout">
                    <label htmlFor="amazon-tag">AMAZON ASSOCIATES TAG</label>
                    <input
                      id="amazon-tag"
                      value={associateTag}
                      onChange={(event) => updateAssociateTag(event.target.value)}
                      placeholder="required by Amazon"
                    />
                    {amazonUrl ? (
                      <a
                        className="cart-checkout"
                        href={amazonUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        ADD ALL TO AMAZON CART ↗
                      </a>
                    ) : (
                      <p>
                        Enter an Associates tag to enable Amazon’s official multi-item cart.
                        Demo items cannot be added.
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="cart-note">
                    This store has no reliable public multi-add link. Open items individually.
                  </p>
                )}
              </section>
            ))}
            <button type="button" className="cart-clear" onClick={onClear}>
              CLEAR CART
            </button>
          </>
        )}
      </aside>
    </div>
  );
}
