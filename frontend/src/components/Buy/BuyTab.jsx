import { useState, useEffect } from 'react';
import api from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';

export default function BuyTab() {
  const { user } = useAuth();
  const [materials, setMaterials] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [cart, setCart] = useState([]);
  const [selectedSupplier, setSelectedSupplier] = useState('');
  const [modal, setModal] = useState(null); // { material }
  const [weight, setWeight] = useState('');
  const [overridePrice, setOverridePrice] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const [matRes, supRes] = await Promise.all([api.get('/materials'), api.get('/suppliers')]);
      setMaterials(matRes.data);
      setSuppliers(supRes.data);
    } finally {
      setLoading(false);
    }
  };

  const openModal = (material) => {
    setModal({ material });
    setWeight('');
    setOverridePrice('');
  };

  const closeModal = () => {
    setModal(null);
    setWeight('');
    setOverridePrice('');
  };

  const calculatedPrice = modal && weight
    ? (Number(weight) * modal.material.pricePerKg).toFixed(2)
    : '0.00';

  const addToCart = () => {
    if (!weight || Number(weight) <= 0) return;
    const totalPrice = overridePrice !== '' ? Number(overridePrice) : Number(calculatedPrice);
    const existing = cart.findIndex((item) => item.materialId === modal.material._id);

    if (existing >= 0) {
      const updated = [...cart];
      updated[existing] = {
        ...updated[existing],
        weight: updated[existing].weight + Number(weight),
        totalPrice: updated[existing].totalPrice + totalPrice,
      };
      setCart(updated);
    } else {
      setCart([
        ...cart,
        {
          materialId: modal.material._id,
          materialName: modal.material.name,
          weight: Number(weight),
          pricePerKg: modal.material.pricePerKg,
          unit: modal.material.unit,
          totalPrice,
        },
      ]);
    }
    closeModal();
  };

  const removeFromCart = (materialId) => {
    setCart(cart.filter((item) => item.materialId !== materialId));
  };

  const updateCartItemPrice = (materialId, newPrice) => {
    setCart(cart.map((item) =>
      item.materialId === materialId ? { ...item, totalPrice: Number(newPrice) } : item
    ));
  };

  const grandTotal = cart.reduce((sum, item) => sum + item.totalPrice, 0);

  const completeTransaction = async () => {
    if (cart.length === 0) return;
    setSaving(true);
    try {
      const supplier = suppliers.find((s) => s._id === selectedSupplier);
      const payload = {
        items: cart.map((item) => ({
          material: item.materialId,
          materialName: item.materialName,
          weight: item.weight,
          pricePerKg: item.pricePerKg,
          totalPrice: item.totalPrice,
          unit: item.unit,
        })),
        supplier: selectedSupplier || null,
        supplierName: supplier?.name || null,
        grandTotal,
        createdBy: user.username,
      };
      await api.post('/transactions', payload);
      setCart([]);
      setSelectedSupplier('');
      setSuccessMsg('Transaction completed successfully!');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to complete transaction');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="empty-state">Loading materials...</div>;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, alignItems: 'start' }}>
      {/* Materials Grid */}
      <div>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Select Materials</h2>
        {materials.length === 0 ? (
          <div className="card">
            <div className="empty-state">No materials available. Add materials in the Items tab.</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
            {materials.map((m) => (
              <button
                key={m._id}
                onClick={() => openModal(m)}
                style={{
                  background: 'white',
                  border: '1.5px solid var(--border)',
                  borderRadius: 10,
                  padding: '16px 12px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  boxShadow: 'var(--shadow)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--primary)';
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(22,163,74,0.1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border)';
                  e.currentTarget.style.boxShadow = 'var(--shadow)';
                }}
              >
                <div style={{ fontSize: 28, marginBottom: 8 }}>♻️</div>
                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)', marginBottom: 4 }}>{m.name}</div>
                <div style={{ fontSize: 12, color: 'var(--primary-dark)', fontWeight: 500 }}>
                  {Number(m.pricePerKg).toLocaleString('en-US', { minimumFractionDigits: 2 })} / {m.unit}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Cart */}
      <div className="card" style={{ position: 'sticky', top: 76 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Transaction</h2>

        {successMsg && (
          <div style={{ background: 'var(--primary-light)', color: 'var(--primary-dark)', padding: '10px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13, fontWeight: 500 }}>
            ✓ {successMsg}
          </div>
        )}

        {cart.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '24px 0', fontSize: 13 }}>
            Click a material to add it
          </p>
        ) : (
          <div style={{ marginBottom: 16 }}>
            {cart.map((item) => (
              <div key={item.materialId} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontWeight: 500 }}>{item.materialName}</span>
                  <button
                    onClick={() => removeFromCart(item.materialId)}
                    style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 16, padding: 0, lineHeight: 1 }}
                  >
                    ×
                  </button>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                    {item.weight} {item.unit}
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.totalPrice}
                    onChange={(e) => updateCartItemPrice(item.materialId, e.target.value)}
                    style={{ width: 90, textAlign: 'right', padding: '4px 8px', fontSize: 13, fontWeight: 600, color: 'var(--primary-dark)' }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Supplier */}
        <div className="form-group" style={{ marginBottom: 14 }}>
          <label>Supplier <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
          <select value={selectedSupplier} onChange={(e) => setSelectedSupplier(e.target.value)}>
            <option value="">— No supplier —</option>
            {suppliers.map((s) => (
              <option key={s._id} value={s._id}>{s.name}</option>
            ))}
          </select>
        </div>

        {/* Grand Total */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderTop: '2px solid var(--border)', marginBottom: 14 }}>
          <span style={{ fontWeight: 600 }}>Grand Total</span>
          <span style={{ fontWeight: 700, fontSize: 20, color: 'var(--primary-dark)' }}>
            {grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </span>
        </div>

        <button
          className="btn-primary"
          style={{ width: '100%', padding: '10px' }}
          onClick={completeTransaction}
          disabled={cart.length === 0 || saving}
        >
          {saving ? 'Processing...' : 'Complete Transaction'}
        </button>
      </div>

      {/* Weight Entry Modal */}
      {modal && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', zIndex: 999,
          }}
          onClick={(e) => e.target === e.currentTarget && closeModal()}
        >
          <div className="card" style={{ width: 340, boxShadow: 'var(--shadow-md)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>{modal.material.name}</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>
              Rate: {Number(modal.material.pricePerKg).toLocaleString('en-US', { minimumFractionDigits: 2 })} / {modal.material.unit}
            </p>

            <div className="form-group" style={{ marginBottom: 12 }}>
              <label>Weight ({modal.material.unit})</label>
              <input
                type="number"
                placeholder="0.00"
                min="0"
                step="0.01"
                value={weight}
                onChange={(e) => { setWeight(e.target.value); setOverridePrice(''); }}
                autoFocus
              />
            </div>

            <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 12px', marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--text-muted)' }}>Calculated price</span>
                <span style={{ fontWeight: 600, color: 'var(--primary-dark)' }}>{calculatedPrice}</span>
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: 20 }}>
              <label>Override Price <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
              <input
                type="number"
                placeholder={calculatedPrice}
                min="0"
                step="0.01"
                value={overridePrice}
                onChange={(e) => setOverridePrice(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn-primary"
                style={{ flex: 1 }}
                onClick={addToCart}
                disabled={!weight || Number(weight) <= 0}
              >
                Add to Cart
              </button>
              <button className="btn-ghost" onClick={closeModal}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
