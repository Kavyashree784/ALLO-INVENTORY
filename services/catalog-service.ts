import { prisma } from "@/lib/prisma";
import { serializeCatalogProduct, serializeWarehouse } from "@/lib/serializers";

export async function getCatalogProducts() {
  const [products, warehouses, inventories] = await Promise.all([
    prisma.product.findMany({ orderBy: { name: "asc" } }),
    prisma.warehouse.findMany({ orderBy: { name: "asc" } }),
    prisma.inventory.findMany({
      orderBy: [{ productId: "asc" }, { warehouseId: "asc" }],
      include: {
        warehouse: true,
      },
    }),
  ]);

  const inventoryByProduct = new Map<string, typeof inventories>();

  for (const inventory of inventories) {
    const rows = inventoryByProduct.get(inventory.productId) ?? [];
    rows.push(inventory);
    inventoryByProduct.set(inventory.productId, rows);
  }

  return {
    products: products.map((product) =>
      serializeCatalogProduct(product, inventoryByProduct.get(product.id) ?? [])
    ),
    warehouses: warehouses.map(serializeWarehouse),
  };
}

export async function getWarehouses() {
  const warehouses = await prisma.warehouse.findMany({ orderBy: { name: "asc" } });
  return { warehouses: warehouses.map(serializeWarehouse) };
}