// models/Menu.js
const mongoose = require("mongoose");
const { Schema, model } = mongoose;

const MenuItemSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    category: {
      type: String,
      enum: ["Rice","Roti","Curry","Dal","Veg","NonVeg","Sweet","Soup","Other"],
      required: true,
    },
    imageUrl: { type: String, default: null }, // <-- add this
  },
  { _id: false }
);

const MenuSchema = new Schema(
  {
    date: { type: String, required: true }, // 'YYYY-MM-DD' (IST)
    items: { type: [MenuItemSchema], default: [] },
    blockName: { type: String },
    mealType: {
      type: String,
      enum: ["breakfast", "lunch", "dinner", "snacks"],
      default: "lunch",
    },
    createdBy: { type: Schema.Types.ObjectId, ref: "Warden" },
  },
  { timestamps: true }
);

MenuSchema.index({ date: 1, blockName: 1 }, { unique: true, sparse: true });

module.exports = model("Menu", MenuSchema);
