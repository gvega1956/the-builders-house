/**
 * Detector de anomalías en tiempo real.
 * Se ejecuta DESPUÉS de cada transacción — no bloquea la operación principal.
 * Las alertas se graban en audit_log con action='SECURITY_ALERT'.
 */

import { type PrismaClient, type Prisma } from '@prisma/client';

export type AnomalyLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

interface Alert {
  level: AnomalyLevel;
  rule: string;
  description: string;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown>;
}

// Zona horaria Puerto Rico (UTC-4)
function hourInPR(date: Date): number {
  return new Date(date.toLocaleString('en-US', { timeZone: 'America/Puerto_Rico' })).getHours();
}

function isAfterHours(date: Date): boolean {
  const h = hourInPR(date);
  return h < 7 || h >= 20;
}

async function saveAlerts(
  db: PrismaClient,
  userId: string,
  alerts: Alert[],
  ipAddress?: string,
): Promise<void> {
  for (const alert of alerts) {
    await db.auditLog.create({
      data: {
        userId,
        action: 'SECURITY_ALERT',
        entityType: alert.entityType,
        entityId: alert.entityId,
        newValues: {
          level: alert.level,
          rule: alert.rule,
          description: alert.description,
          ...alert.metadata,
        } as Prisma.InputJsonValue,
        ipAddress,
      },
    });
  }
}

// ─── MOVIMIENTOS DE INVENTARIO ────────────────────────────────────────────────

interface MovementInput {
  movementId: string;
  productId: string;
  locationId: string;
  movementType: string;
  quantity: number;
  userId: string;
  referenceId?: string;
  notes?: string;
}

export async function detectMovementAnomalies(
  db: PrismaClient,
  input: MovementInput,
  ipAddress?: string,
): Promise<void> {
  try {
    const alerts: Alert[] = [];
    const now = new Date();

    // Regla 1 — Fuera de horario (OUT o ADJUSTMENT fuera de 7AM-8PM PR)
    if (['OUT', 'ADJUSTMENT', 'DAMAGE'].includes(input.movementType) && isAfterHours(now)) {
      alerts.push({
        level: 'MEDIUM',
        rule: 'AFTER_HOURS_MOVEMENT',
        description: `Movimiento ${input.movementType} registrado fuera de horario laboral (${hourInPR(now)}:xx hora PR)`,
        entityType: 'InventoryMovement',
        entityId: input.movementId,
        metadata: { movementType: input.movementType, quantity: input.quantity, hourPR: hourInPR(now) },
      });
    }

    // Regla 2 — Ajuste negativo grande (> 10 unidades)
    if (input.movementType === 'ADJUSTMENT' && input.quantity < -10) {
      alerts.push({
        level: 'HIGH',
        rule: 'LARGE_NEGATIVE_ADJUSTMENT',
        description: `Ajuste de inventario negativo grande: ${input.quantity} unidades en un solo movimiento`,
        entityType: 'InventoryMovement',
        entityId: input.movementId,
        metadata: { quantity: input.quantity, productId: input.productId, locationId: input.locationId },
      });
    }

    // Regla 3 — Movimiento DAMAGE (siempre se registra)
    if (input.movementType === 'DAMAGE') {
      alerts.push({
        level: 'HIGH',
        rule: 'DAMAGE_MOVEMENT',
        description: `Movimiento de daño registrado: ${Math.abs(input.quantity)} unidades reportadas como dañadas`,
        entityType: 'InventoryMovement',
        entityId: input.movementId,
        metadata: { quantity: input.quantity, productId: input.productId, notes: input.notes ?? null },
      });
    }

    // Regla 4 — Mismo producto OUT por mismo usuario en < 5 min
    if (input.movementType === 'OUT') {
      const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);
      const recentOuts = await db.inventoryMovement.count({
        where: {
          userId: input.userId,
          productId: input.productId,
          movementType: 'OUT',
          createdAt: { gte: fiveMinAgo },
          id: { not: input.movementId },
        },
      });
      if (recentOuts > 0) {
        alerts.push({
          level: 'CRITICAL',
          rule: 'DUPLICATE_OUT_SAME_PRODUCT',
          description: `El usuario realizó ${recentOuts + 1} salidas del mismo producto en menos de 5 minutos`,
          entityType: 'InventoryMovement',
          entityId: input.movementId,
          metadata: { productId: input.productId, recentOutsCount: recentOuts, windowMinutes: 5 },
        });
      }
    }

    // Regla 5 — Stock resultante cero o negativo tras movimiento
    if (['OUT', 'ADJUSTMENT', 'DAMAGE'].includes(input.movementType)) {
      const loc = await db.productLocation.findUnique({
        where: { id: input.locationId },
        select: { quantityOnHand: true },
      });
      if (loc && loc.quantityOnHand <= 0) {
        alerts.push({
          level: 'MEDIUM',
          rule: 'STOCK_AT_ZERO',
          description: `El stock de esta ubicación cayó a ${loc.quantityOnHand} tras el movimiento`,
          entityType: 'InventoryMovement',
          entityId: input.movementId,
          metadata: { locationId: input.locationId, stockAfter: loc.quantityOnHand },
        });
      }
    }

    if (alerts.length > 0) {
      await saveAlerts(db, input.userId, alerts, ipAddress);
    }
  } catch {
    // La detección de anomalías nunca debe romper la operación principal
  }
}

// ─── FACTURAS ─────────────────────────────────────────────────────────────────

interface InvoiceVoidInput {
  invoiceId: string;
  invoiceNumber: string;
  total: number;
  createdAt: Date;
  voidedAt: Date;
  customerId: string;
  userId: string;
  reason: string;
}

export async function detectInvoiceVoidAnomalies(
  db: PrismaClient,
  input: InvoiceVoidInput,
  ipAddress?: string,
): Promise<void> {
  try {
    const alerts: Alert[] = [];
    const minutesAlive = Math.round((input.voidedAt.getTime() - input.createdAt.getTime()) / 60000);

    // Regla 6 — Factura anulada en menos de 30 minutos
    if (minutesAlive < 30) {
      alerts.push({
        level: 'HIGH',
        rule: 'QUICK_VOID',
        description: `Factura ${input.invoiceNumber} anulada ${minutesAlive} minuto(s) después de emitirse`,
        entityType: 'Invoice',
        entityId: input.invoiceId,
        metadata: { invoiceNumber: input.invoiceNumber, total: input.total, minutesAlive, reason: input.reason },
      });
    }

    // Regla 7 — Factura de monto alto anulada (> $500)
    if (input.total >= 500) {
      const level: AnomalyLevel = input.total >= 2000 ? 'CRITICAL' : 'MEDIUM';
      alerts.push({
        level,
        rule: 'HIGH_VALUE_VOID',
        description: `Factura de $${input.total.toFixed(2)} anulada — ${input.invoiceNumber}`,
        entityType: 'Invoice',
        entityId: input.invoiceId,
        metadata: { invoiceNumber: input.invoiceNumber, total: input.total, customerId: input.customerId, reason: input.reason },
      });
    }

    if (alerts.length > 0) {
      await saveAlerts(db, input.userId, alerts, ipAddress);
    }
  } catch {
    // Silencioso — nunca bloquea la anulación
  }
}

interface InvoiceCreateInput {
  invoiceId: string;
  invoiceNumber: string;
  status: string;
  userId: string;
  total: number;
}

export async function detectInvoiceCreateAnomalies(
  db: PrismaClient,
  input: InvoiceCreateInput,
  ipAddress?: string,
): Promise<void> {
  try {
    const alerts: Alert[] = [];

    // Regla 8 — 3+ facturas PENDING_AUTHORIZATION del mismo usuario en el mismo día
    if (input.status === 'PENDING_AUTHORIZATION') {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const pendingCount = await db.invoice.count({
        where: {
          createdById: input.userId,
          status: 'PENDING_AUTHORIZATION',
          createdAt: { gte: startOfDay },
        },
      });

      if (pendingCount >= 3) {
        alerts.push({
          level: 'HIGH',
          rule: 'REPEATED_STOCK_SHORTAGE',
          description: `El usuario tiene ${pendingCount} facturas pendientes de autorización hoy — posible intento de sobrepasar el control de stock`,
          entityType: 'Invoice',
          entityId: input.invoiceId,
          metadata: { invoiceNumber: input.invoiceNumber, pendingTodayCount: pendingCount, total: input.total },
        });
      }
    }

    if (alerts.length > 0) {
      await saveAlerts(db, input.userId, alerts, ipAddress);
    }
  } catch {
    // Silencioso
  }
}
