"use client";

import { useState } from "react";

export function AddToCart({ soldOut }: { soldOut: boolean }) {
  const [added, setAdded] = useState(false);
  return (
    <button className="cd-btn block" disabled={soldOut} onClick={() => setAdded(true)}>
      {soldOut ? "Out of stock" : added ? "Added to cart ✓" : "Add to cart"}
    </button>
  );
}
