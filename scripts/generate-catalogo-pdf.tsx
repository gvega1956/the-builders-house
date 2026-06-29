/**
 * Script para generar catálogo PDF de inventario
 * Ejecutar: npx tsx scripts/generate-catalogo-pdf.tsx
 */

import React from 'react';
import ReactPDF, {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from '@react-pdf/renderer';

// ─── DATOS DEL INVENTARIO ────────────────────────────────────────────────────

type VentanaRow = {
  width: number;
  heightDisplay: string;
  sku: string;
  aeStock: number;
  bgStock: number;
};

type PuertaRow = {
  width: number;
  heightDisplay: string;
  sku: string;
  stock: number;
  unitCost: number;
};

function hcode(h: number): string {
  return Math.round(h * 100).toString();
}

function skuV(lama: '3' | '4', w: number, h: number, ac: 'AE' | 'BG'): string {
  return `VS-L${lama}-${w}X${hcode(h)}-${ac}`;
}

function skuP(w: number, h: number): string {
  return `PD-L4-${w}X${hcode(h)}-AE`;
}

const L4_RAW = [
  { width: 18, heightIn: 17,    heightDisplay: '17',     aeStock: 32,  bgStock: 28 },
  { width: 18, heightIn: 22,    heightDisplay: '22',     aeStock: 23,  bgStock: 10 },
  { width: 24, heightIn: 21.75, heightDisplay: '21 3/4', aeStock: 46,  bgStock: 26 },
  { width: 24, heightIn: 25,    heightDisplay: '25',     aeStock: 16,  bgStock: 4  },
  { width: 24, heightIn: 29.75, heightDisplay: '29 3/4', aeStock: 1,   bgStock: 8  },
  { width: 24, heightIn: 37.75, heightDisplay: '37 3/4', aeStock: 51,  bgStock: 26 },
  { width: 24, heightIn: 45.75, heightDisplay: '45 3/4', aeStock: 105, bgStock: 96 },
  { width: 24, heightIn: 53.75, heightDisplay: '53 3/4', aeStock: 75,  bgStock: 50 },
  { width: 24, heightIn: 56,    heightDisplay: '56',     aeStock: 6,   bgStock: 0  },
  { width: 24, heightIn: 57.75, heightDisplay: '57 3/4', aeStock: 22,  bgStock: 14 },
  { width: 30, heightIn: 21.75, heightDisplay: '21 3/4', aeStock: 1,   bgStock: 23 },
  { width: 30, heightIn: 29.75, heightDisplay: '29 3/4', aeStock: 6,   bgStock: 2  },
  { width: 30, heightIn: 37.75, heightDisplay: '37 3/4', aeStock: 8,   bgStock: 25 },
  { width: 30, heightIn: 45.75, heightDisplay: '45 3/4', aeStock: 87,  bgStock: 43 },
  { width: 30, heightIn: 53.75, heightDisplay: '53 3/4', aeStock: 22,  bgStock: 31 },
  { width: 30, heightIn: 57.75, heightDisplay: '57 3/4', aeStock: 0,   bgStock: 15 },
  { width: 36, heightIn: 21.75, heightDisplay: '21 3/4', aeStock: 8,   bgStock: 13 },
  { width: 36, heightIn: 29.75, heightDisplay: '29 3/4', aeStock: 7,   bgStock: 28 },
  { width: 36, heightIn: 37.75, heightDisplay: '37 3/4', aeStock: 33,  bgStock: 20 },
  { width: 36, heightIn: 45.75, heightDisplay: '45 3/4', aeStock: 0,   bgStock: 0  },
  { width: 36, heightIn: 53.75, heightDisplay: '53 3/4', aeStock: 2,   bgStock: 0  },
  { width: 36, heightIn: 57.75, heightDisplay: '57 3/4', aeStock: 62,  bgStock: 32 },
];

const L3_RAW = [
  { width: 18, heightIn: 16,    heightDisplay: '16',     aeStock: 16,  bgStock: 0  },
  { width: 18, heightIn: 16.75, heightDisplay: '16 3/4', aeStock: 30,  bgStock: 30 },
  { width: 24, heightIn: 22.75, heightDisplay: '22 3/4', aeStock: 43,  bgStock: 0  },
  { width: 24, heightIn: 28.75, heightDisplay: '28 3/4', aeStock: 67,  bgStock: 16 },
  { width: 24, heightIn: 32,    heightDisplay: '32',     aeStock: 1,   bgStock: 0  },
  { width: 24, heightIn: 37.75, heightDisplay: '37 3/4', aeStock: 0,   bgStock: 13 },
  { width: 24, heightIn: 46.75, heightDisplay: '46 3/4', aeStock: 93,  bgStock: 28 },
  { width: 24, heightIn: 47,    heightDisplay: '47',     aeStock: 1,   bgStock: 0  },
  { width: 24, heightIn: 52.75, heightDisplay: '52 3/4', aeStock: 4,   bgStock: 13 },
  { width: 24, heightIn: 58.75, heightDisplay: '58 3/4', aeStock: 62,  bgStock: 2  },
  { width: 30, heightIn: 22.75, heightDisplay: '22 3/4', aeStock: 38,  bgStock: 30 },
  { width: 30, heightIn: 28.75, heightDisplay: '28 3/4', aeStock: 3,   bgStock: 24 },
  { width: 30, heightIn: 37.75, heightDisplay: '37 3/4', aeStock: 28,  bgStock: 22 },
  { width: 30, heightIn: 46.75, heightDisplay: '46 3/4', aeStock: 65,  bgStock: 38 },
  { width: 30, heightIn: 52.75, heightDisplay: '52 3/4', aeStock: 0,   bgStock: 40 },
  { width: 30, heightIn: 58.75, heightDisplay: '58 3/4', aeStock: 26,  bgStock: 23 },
  { width: 36, heightIn: 22.75, heightDisplay: '22 3/4', aeStock: 20,  bgStock: 14 },
  { width: 36, heightIn: 28.75, heightDisplay: '28 3/4', aeStock: 0,   bgStock: 48 },
  { width: 36, heightIn: 37.75, heightDisplay: '37 3/4', aeStock: 2,   bgStock: 1  },
  { width: 36, heightIn: 46.75, heightDisplay: '46 3/4', aeStock: 0,   bgStock: 18 },
  { width: 36, heightIn: 52.75, heightDisplay: '52 3/4', aeStock: 31,  bgStock: 14 },
  { width: 36, heightIn: 58.75, heightDisplay: '58 3/4', aeStock: 104, bgStock: 54 },
];

const LAMA4_VENTANAS: VentanaRow[] = L4_RAW.map(r => ({
  width: r.width,
  heightDisplay: r.heightDisplay,
  sku: skuV('4', r.width, r.heightIn, 'AE'),
  aeStock: r.aeStock,
  bgStock: r.bgStock,
}));

const LAMA3_VENTANAS: VentanaRow[] = L3_RAW.map(r => ({
  width: r.width,
  heightDisplay: r.heightDisplay,
  sku: skuV('3', r.width, r.heightIn, 'AE'),
  aeStock: r.aeStock,
  bgStock: r.bgStock,
}));

const LAMA4_PUERTAS: PuertaRow[] = [
  { width: 30, heightDisplay: '81', sku: skuP(30, 81), stock: 1, unitCost: 59.06 },
  { width: 30, heightDisplay: '84', sku: skuP(30, 84), stock: 1, unitCost: 61.25 },
  { width: 30, heightDisplay: '95', sku: skuP(30, 95), stock: 1, unitCost: 69.27 },
  { width: 32, heightDisplay: '81', sku: skuP(32, 81), stock: 1, unitCost: 63.00 },
  { width: 32, heightDisplay: '84', sku: skuP(32, 84), stock: 1, unitCost: 65.33 },
  { width: 32, heightDisplay: '95', sku: skuP(32, 95), stock: 1, unitCost: 73.89 },
];

// ─── ESTILOS ──────────────────────────────────────────────────────────────────

const NAVY = '#0A1628';
const ORANGE = '#EC6326';
const LIGHT_GRAY = '#F8FAFC';
const MID_GRAY = '#CBD5E1';
const TEXT_DARK = '#1E293B';
const TEXT_MED = '#475569';
const SUCCESS = '#059669';
const INFO = '#0284C7';

const styles = StyleSheet.create({
  page: {
    backgroundColor: '#FFFFFF',
    fontFamily: 'Helvetica',
    paddingTop: 40,
    paddingBottom: 50,
    paddingHorizontal: 36,
  },
  // Header
  header: {
    backgroundColor: NAVY,
    marginTop: -40,
    marginHorizontal: -36,
    paddingTop: 24,
    paddingBottom: 20,
    paddingHorizontal: 36,
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 20,
    color: '#FFFFFF',
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 1,
  },
  headerSubtitle: {
    fontSize: 9,
    color: '#94A3B8',
    marginTop: 4,
    letterSpacing: 0.5,
  },
  headerOrange: {
    color: ORANGE,
    fontFamily: 'Helvetica-Bold',
  },
  // Sección
  sectionHeader: {
    backgroundColor: NAVY,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 0,
    borderRadius: 4,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 0.5,
  },
  sectionSubtitle: {
    color: '#94A3B8',
    fontSize: 8,
    marginTop: 2,
  },
  // Badge de acabado
  badgeRow: {
    flexDirection: 'row',
    marginTop: 8,
    marginBottom: 2,
    gap: 8,
  },
  badgeAE: {
    backgroundColor: '#FDE4D4',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  badgeAEText: {
    color: '#D9531E',
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
  },
  badgeBG: {
    backgroundColor: '#DBEAFE',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  badgeBGText: {
    color: '#1D4ED8',
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
  },
  // Tabla
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#1E293B',
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  tableHeaderCell: {
    color: '#94A3B8',
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  tableRowAlt: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingVertical: 5,
    paddingHorizontal: 8,
    backgroundColor: LIGHT_GRAY,
  },
  tableCell: {
    fontSize: 8,
    color: TEXT_DARK,
  },
  tableCellMono: {
    fontSize: 7.5,
    color: TEXT_MED,
    fontFamily: 'Helvetica',
  },
  tableCellBold: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: TEXT_DARK,
  },
  stockAE: {
    fontSize: 8,
    color: '#D9531E',
    fontFamily: 'Helvetica-Bold',
  },
  stockBG: {
    fontSize: 8,
    color: '#1D4ED8',
    fontFamily: 'Helvetica-Bold',
  },
  stockZero: {
    fontSize: 8,
    color: '#94A3B8',
  },
  // Columnas ventanas
  colNum:      { width: '5%' },
  colSKU:      { width: '32%' },
  colNombre:   { width: '30%' },
  colMedida:   { width: '13%' },
  colStockAE:  { width: '10%', textAlign: 'right' },
  colStockBG:  { width: '10%', textAlign: 'right' },
  // Columnas puertas
  colPNum:     { width: '5%' },
  colPSKU:     { width: '38%' },
  colPNombre:  { width: '32%' },
  colPMedida:  { width: '13%' },
  colPStock:   { width: '6%',  textAlign: 'right' },
  colPCosto:   { width: '6%',  textAlign: 'right' },
  // Footer
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 36,
    right: 36,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: MID_GRAY,
    paddingTop: 6,
  },
  footerText: {
    fontSize: 7,
    color: '#94A3B8',
  },
  // Totales
  totalesBox: {
    flexDirection: 'row',
    marginTop: 10,
    gap: 8,
  },
  totalCard: {
    flex: 1,
    backgroundColor: LIGHT_GRAY,
    borderRadius: 6,
    padding: 10,
    borderLeftWidth: 3,
    borderLeftColor: ORANGE,
  },
  totalCardBlue: {
    flex: 1,
    backgroundColor: '#EFF6FF',
    borderRadius: 6,
    padding: 10,
    borderLeftWidth: 3,
    borderLeftColor: INFO,
  },
  totalCardGreen: {
    flex: 1,
    backgroundColor: '#ECFDF5',
    borderRadius: 6,
    padding: 10,
    borderLeftWidth: 3,
    borderLeftColor: SUCCESS,
  },
  totalLabel: { fontSize: 7, color: TEXT_MED, marginBottom: 2 },
  totalValue: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: TEXT_DARK },
  totalSub:   { fontSize: 7, color: TEXT_MED, marginTop: 1 },
  // Espaciado
  mt8:  { marginTop: 8 },
  mt16: { marginTop: 16 },
  mt24: { marginTop: 24 },
});

// ─── COMPONENTES ──────────────────────────────────────────────────────────────

const TableHeaderVentanas = () => (
  <View style={styles.tableHeader}>
    <Text style={[styles.tableHeaderCell, styles.colNum]}>#</Text>
    <Text style={[styles.tableHeaderCell, styles.colSKU]}>SKU / Referencia</Text>
    <Text style={[styles.tableHeaderCell, styles.colNombre]}>Descripcion</Text>
    <Text style={[styles.tableHeaderCell, styles.colMedida]}>Medida (in)</Text>
    <Text style={[styles.tableHeaderCell, styles.colStockAE, { textAlign: 'right' }]}>Stk A/E</Text>
    <Text style={[styles.tableHeaderCell, styles.colStockBG, { textAlign: 'right' }]}>Stk B/G</Text>
  </View>
);

const VentanaRows = ({ rows, lama }: { rows: VentanaRow[]; lama: '3' | '4' }) =>
  rows.map((row, i) => {
    const skuAE = row.sku;
    const skuBG = skuAE.replace('-AE', '-BG');
    const nombre = `Ventana Jalousie Lama ${lama}" ${row.width}"x${row.heightDisplay}"`;
    const isAlt = i % 2 === 1;
    const rowStyle = isAlt ? styles.tableRowAlt : styles.tableRow;
    return (
      <View key={skuAE} style={rowStyle}>
        <Text style={[styles.tableCell, styles.colNum, styles.stockZero]}>{i + 1}</Text>
        <View style={styles.colSKU}>
          <Text style={styles.tableCellMono}>{skuAE}</Text>
          <Text style={[styles.tableCellMono, { color: '#94A3B8' }]}>{skuBG}</Text>
        </View>
        <Text style={[styles.tableCell, styles.colNombre]}>{nombre}</Text>
        <Text style={[styles.tableCell, styles.colMedida]}>
          {row.width}" x {row.heightDisplay}"
        </Text>
        <Text style={[styles.colStockAE, row.aeStock > 0 ? styles.stockAE : styles.stockZero]}>
          {row.aeStock}
        </Text>
        <Text style={[styles.colStockBG, row.bgStock > 0 ? styles.stockBG : styles.stockZero]}>
          {row.bgStock}
        </Text>
      </View>
    );
  });

const TableHeaderPuertas = () => (
  <View style={styles.tableHeader}>
    <Text style={[styles.tableHeaderCell, styles.colPNum]}>#</Text>
    <Text style={[styles.tableHeaderCell, styles.colPSKU]}>SKU / Referencia</Text>
    <Text style={[styles.tableHeaderCell, styles.colPNombre]}>Descripcion</Text>
    <Text style={[styles.tableHeaderCell, styles.colPMedida]}>Medida (in)</Text>
    <Text style={[styles.tableHeaderCell, styles.colPStock, { textAlign: 'right' }]}>Stk</Text>
    <Text style={[styles.tableHeaderCell, styles.colPCosto, { textAlign: 'right' }]}>Costo</Text>
  </View>
);

const PuertaRows = ({ rows }: { rows: PuertaRow[] }) =>
  rows.map((row, i) => {
    const nombre = `Puerta Cristal Lama 4" ${row.width}"x${row.heightDisplay}"`;
    const isAlt = i % 2 === 1;
    return (
      <View key={row.sku} style={isAlt ? styles.tableRowAlt : styles.tableRow}>
        <Text style={[styles.tableCell, styles.colPNum, styles.stockZero]}>{i + 1}</Text>
        <Text style={[styles.tableCellMono, styles.colPSKU]}>{row.sku}</Text>
        <Text style={[styles.tableCell, styles.colPNombre]}>{nombre}</Text>
        <Text style={[styles.tableCell, styles.colPMedida]}>
          {row.width}" x {row.heightDisplay}"
        </Text>
        <Text style={[styles.tableCellBold, styles.colPStock, { textAlign: 'right', color: SUCCESS }]}>
          {row.stock}
        </Text>
        <Text style={[styles.tableCellBold, styles.colPCosto, { textAlign: 'right', color: TEXT_MED }]}>
          ${row.unitCost.toFixed(2)}
        </Text>
      </View>
    );
  });

// ─── TOTALES ──────────────────────────────────────────────────────────────────

const l4TotalAE = LAMA4_VENTANAS.reduce((s, r) => s + r.aeStock, 0);
const l4TotalBG = LAMA4_VENTANAS.reduce((s, r) => s + r.bgStock, 0);
const l3TotalAE = LAMA3_VENTANAS.reduce((s, r) => s + r.aeStock, 0);
const l3TotalBG = LAMA3_VENTANAS.reduce((s, r) => s + r.bgStock, 0);
const puertasTotal = LAMA4_PUERTAS.reduce((s, r) => s + r.stock, 0);
const granTotal = l4TotalAE + l4TotalBG + l3TotalAE + l3TotalBG + puertasTotal;
const fechaGeneracion = new Date().toLocaleDateString('es-PR', {
  year: 'numeric', month: 'long', day: 'numeric',
});

// ─── DOCUMENTO PDF ────────────────────────────────────────────────────────────

const CatalogoPDF = () => (
  <Document
    title="Catalogo de Inventario - The Builder's House"
    author="The Builder's House"
    subject="Inventario de Ventanas y Puertas"
    creator="Sistema ERP - The Builder's House"
  >
    {/* ── PÁGINA 1: Portada + Resumen ── */}
    <Page size="LETTER" orientation="landscape" style={styles.page}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          THE BUILDER'S <Text style={styles.headerOrange}>HOUSE</Text> · Puerto Rico
        </Text>
        <Text style={styles.headerSubtitle}>
          CATALOGO DE INVENTARIO — Ventanas de Seguridad y Puertas de Cristal
        </Text>
        <Text style={[styles.headerSubtitle, { marginTop: 2 }]}>
          Proveedor: Standard Windows and Doors Exports S.R.L. · Almacen: San Juan, PR
        </Text>
      </View>

      {/* Resumen ejecutivo */}
      <Text style={[styles.sectionTitle, { color: TEXT_DARK, fontSize: 13, marginBottom: 12 }]}>
        Resumen del Inventario
      </Text>
      <View style={styles.totalesBox}>
        <View style={styles.totalCard}>
          <Text style={styles.totalLabel}>Ventanas Lama 4" — Acid Etched</Text>
          <Text style={styles.totalValue}>{l4TotalAE.toLocaleString()}</Text>
          <Text style={styles.totalSub}>unidades en stock · {LAMA4_VENTANAS.length} medidas</Text>
        </View>
        <View style={styles.totalCardBlue}>
          <Text style={styles.totalLabel}>Ventanas Lama 4" — Blue Green</Text>
          <Text style={styles.totalValue}>{l4TotalBG.toLocaleString()}</Text>
          <Text style={styles.totalSub}>unidades en stock · {LAMA4_VENTANAS.length} medidas</Text>
        </View>
        <View style={styles.totalCard}>
          <Text style={styles.totalLabel}>Ventanas Lama 3" — Acid Etched</Text>
          <Text style={styles.totalValue}>{l3TotalAE.toLocaleString()}</Text>
          <Text style={styles.totalSub}>unidades en stock · {LAMA3_VENTANAS.length} medidas</Text>
        </View>
        <View style={styles.totalCardBlue}>
          <Text style={styles.totalLabel}>Ventanas Lama 3" — Blue Green</Text>
          <Text style={styles.totalValue}>{l3TotalBG.toLocaleString()}</Text>
          <Text style={styles.totalSub}>unidades en stock · {LAMA3_VENTANAS.length} medidas</Text>
        </View>
        <View style={styles.totalCardGreen}>
          <Text style={styles.totalLabel}>Puertas Cristal Lama 4"</Text>
          <Text style={styles.totalValue}>{puertasTotal}</Text>
          <Text style={styles.totalSub}>unidades en stock · {LAMA4_PUERTAS.length} referencias</Text>
        </View>
      </View>

      <View style={[styles.totalesBox, { marginTop: 10 }]}>
        <View style={[styles.totalCard, { flex: 2, borderLeftColor: NAVY }]}>
          <Text style={styles.totalLabel}>GRAN TOTAL DE UNIDADES EN INVENTARIO</Text>
          <Text style={[styles.totalValue, { fontSize: 22 }]}>{granTotal.toLocaleString()}</Text>
          <Text style={styles.totalSub}>
            L4 Ventanas: {(l4TotalAE + l4TotalBG).toLocaleString()} u · L3 Ventanas: {(l3TotalAE + l3TotalBG).toLocaleString()} u · Puertas: {puertasTotal} u
          </Text>
        </View>
        <View style={[{ flex: 3, padding: 10, backgroundColor: LIGHT_GRAY, borderRadius: 6 }]}>
          <Text style={[styles.totalLabel, { fontFamily: 'Helvetica-Bold', color: TEXT_DARK, marginBottom: 6 }]}>
            Convenciones de SKU
          </Text>
          <Text style={[styles.footerText, { color: TEXT_DARK, marginBottom: 3 }]}>
            VS-L4-24X4575-AE  =  Ventana Seguridad, Lama 4", 24" ancho x 45 3/4" alto, Acid Etched
          </Text>
          <Text style={[styles.footerText, { color: TEXT_DARK, marginBottom: 3 }]}>
            VS-L3-30X4675-BG  =  Ventana Seguridad, Lama 3", 30" ancho x 46 3/4" alto, Blue Green
          </Text>
          <Text style={[styles.footerText, { color: TEXT_DARK }]}>
            PD-L4-32X8400-AE  =  Puerta Cristal, Lama 4", 32" ancho x 84" alto, Acid Etched
          </Text>
          <View style={{ height: 8 }} />
          <Text style={[styles.totalLabel, { marginBottom: 3 }]}>
            Acabados disponibles
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={styles.badgeAE}><Text style={styles.badgeAEText}>A/E — Acid Etched (vidrio esmerilado)</Text></View>
            <View style={styles.badgeBG}><Text style={styles.badgeBGText}>B/G — Blue Green (vidrio azul-verde)</Text></View>
          </View>
        </View>
      </View>

      {/* Footer */}
      <View style={styles.footer} fixed>
        <Text style={styles.footerText}>The Builder's House · Puerto Rico · {fechaGeneracion}</Text>
        <Text style={styles.footerText} render={({ pageNumber, totalPages }) =>
          `Pagina ${pageNumber} de ${totalPages}`
        } />
      </View>
    </Page>

    {/* ── PÁGINA 2: Ventanas Lama 4" ── */}
    <Page size="LETTER" orientation="landscape" style={styles.page}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          THE BUILDER'S <Text style={styles.headerOrange}>HOUSE</Text> · Puerto Rico
        </Text>
        <Text style={styles.headerSubtitle}>CATALOGO DE INVENTARIO</Text>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>VENTANAS DE SEGURIDAD — LAMA 4"</Text>
        <Text style={styles.sectionSubtitle}>
          Ventana jalousie de seguridad · Cristal templado · {LAMA4_VENTANAS.length} medidas disponibles · 2 acabados
        </Text>
      </View>

      <View style={styles.badgeRow}>
        <View style={styles.badgeAE}><Text style={styles.badgeAEText}>A/E — Acid Etched</Text></View>
        <View style={styles.badgeBG}><Text style={styles.badgeBGText}>B/G — Blue Green</Text></View>
        <Text style={[styles.footerText, { marginTop: 3 }]}>
          Stock A/E: {l4TotalAE} u · Stock B/G: {l4TotalBG} u · Total: {l4TotalAE + l4TotalBG} u
        </Text>
      </View>

      <TableHeaderVentanas />
      <VentanaRows rows={LAMA4_VENTANAS} lama="4" />

      <View style={styles.footer} fixed>
        <Text style={styles.footerText}>The Builder's House · Puerto Rico · {fechaGeneracion}</Text>
        <Text style={styles.footerText} render={({ pageNumber, totalPages }) =>
          `Pagina ${pageNumber} de ${totalPages}`
        } />
      </View>
    </Page>

    {/* ── PÁGINA 3: Ventanas Lama 3" ── */}
    <Page size="LETTER" orientation="landscape" style={styles.page}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          THE BUILDER'S <Text style={styles.headerOrange}>HOUSE</Text> · Puerto Rico
        </Text>
        <Text style={styles.headerSubtitle}>CATALOGO DE INVENTARIO</Text>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>VENTANAS DE SEGURIDAD — LAMA 3"</Text>
        <Text style={styles.sectionSubtitle}>
          Ventana jalousie de seguridad · Cristal templado · {LAMA3_VENTANAS.length} medidas disponibles · 2 acabados
        </Text>
      </View>

      <View style={styles.badgeRow}>
        <View style={styles.badgeAE}><Text style={styles.badgeAEText}>A/E — Acid Etched</Text></View>
        <View style={styles.badgeBG}><Text style={styles.badgeBGText}>B/G — Blue Green</Text></View>
        <Text style={[styles.footerText, { marginTop: 3 }]}>
          Stock A/E: {l3TotalAE} u · Stock B/G: {l3TotalBG} u · Total: {l3TotalAE + l3TotalBG} u
        </Text>
      </View>

      <TableHeaderVentanas />
      <VentanaRows rows={LAMA3_VENTANAS} lama="3" />

      <View style={styles.footer} fixed>
        <Text style={styles.footerText}>The Builder's House · Puerto Rico · {fechaGeneracion}</Text>
        <Text style={styles.footerText} render={({ pageNumber, totalPages }) =>
          `Pagina ${pageNumber} de ${totalPages}`
        } />
      </View>
    </Page>

    {/* ── PÁGINA 4: Puertas de Cristal ── */}
    <Page size="LETTER" orientation="landscape" style={styles.page}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          THE BUILDER'S <Text style={styles.headerOrange}>HOUSE</Text> · Puerto Rico
        </Text>
        <Text style={styles.headerSubtitle}>CATALOGO DE INVENTARIO</Text>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>PUERTAS DE CRISTAL — LAMA 4" ACID ETCHED</Text>
        <Text style={styles.sectionSubtitle}>
          Puerta jalousie de cristal · Lama 4" · Acabado Acid Etched · Proveedor: Standard Windows and Doors Exports S.R.L.
        </Text>
      </View>

      <View style={styles.badgeRow}>
        <View style={styles.badgeAE}><Text style={styles.badgeAEText}>A/E — Acid Etched (unico acabado disponible)</Text></View>
        <Text style={[styles.footerText, { marginTop: 3 }]}>
          {LAMA4_PUERTAS.length} referencias · Stock total: {puertasTotal} unidades
        </Text>
      </View>

      <TableHeaderPuertas />
      <PuertaRows rows={LAMA4_PUERTAS} />

      <View style={[styles.totalesBox, { marginTop: 16 }]}>
        <View style={[styles.totalCard, { borderLeftColor: SUCCESS }]}>
          <Text style={styles.totalLabel}>Costo Promedio (fabrica)</Text>
          <Text style={[styles.totalValue, { fontSize: 12, color: SUCCESS }]}>
            ${(LAMA4_PUERTAS.reduce((s, r) => s + r.unitCost, 0) / LAMA4_PUERTAS.length).toFixed(2)}
          </Text>
          <Text style={styles.totalSub}>por unidad · FOB Republica Dominicana</Text>
        </View>
        <View style={[styles.totalCard, { borderLeftColor: NAVY }]}>
          <Text style={styles.totalLabel}>Rango de costos</Text>
          <Text style={[styles.totalValue, { fontSize: 12, color: TEXT_DARK }]}>
            ${Math.min(...LAMA4_PUERTAS.map(r => r.unitCost)).toFixed(2)} — ${Math.max(...LAMA4_PUERTAS.map(r => r.unitCost)).toFixed(2)}
          </Text>
          <Text style={styles.totalSub}>segun medida · anchura 30" o 32"</Text>
        </View>
        <View style={[styles.totalCard, { flex: 2 }]}>
          <Text style={styles.totalLabel}>Nota sobre disponibilidad</Text>
          <Text style={[styles.footerText, { color: TEXT_DARK, marginTop: 3 }]}>
            Las puertas de cristal solo estan disponibles en acabado Acid Etched (A/E).
            Anchuras disponibles: 30" y 32". Alturas: 81", 84" y 95".
            Fuente de costos: Factura No. 30, Standard Windows and Doors Exports S.R.L.
          </Text>
        </View>
      </View>

      <View style={styles.footer} fixed>
        <Text style={styles.footerText}>The Builder's House · Puerto Rico · {fechaGeneracion}</Text>
        <Text style={styles.footerText} render={({ pageNumber, totalPages }) =>
          `Pagina ${pageNumber} de ${totalPages}`
        } />
      </View>
    </Page>
  </Document>
);

// ─── GENERAR PDF ──────────────────────────────────────────────────────────────

const OUTPUT_PATH = 'D:/proyectos/Catalogo-Inventario-BuildersHouse.pdf';

console.log('\n  Generando catalogo PDF...');
console.log(`  Destino: ${OUTPUT_PATH}`);
console.log(`  Productos: ${LAMA4_VENTANAS.length * 2 + LAMA3_VENTANAS.length * 2 + LAMA4_PUERTAS.length} referencias`);
console.log(`  Stock total: ${granTotal.toLocaleString()} unidades\n`);

ReactPDF.render(<CatalogoPDF />, OUTPUT_PATH)
  .then(() => {
    console.log(`  PDF generado exitosamente.`);
    console.log(`  Archivo: ${OUTPUT_PATH}\n`);
  })
  .catch((err: unknown) => {
    console.error('  Error al generar PDF:', err);
    process.exit(1);
  });
