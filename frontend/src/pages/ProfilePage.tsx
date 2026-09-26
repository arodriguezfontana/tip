import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { TopBar } from '@/components/TopBar';
import { CustomerAccountActions } from '@/components/CustomerAccountActions';
import { useAuth } from '@/hooks/useAuth';
import type { Me } from '@/services/authService';
import { getErrorMessage, validateCustomerData } from '@/utils/customerValidation';
import type { CustomerDataErrors } from '@/utils/customerValidation';

const INPUT_CLASS =
  'w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black';

function ProfileForm({ user }: { user: Me }) {
  const { updateProfile } = useAuth();

  const [fullName, setFullName] = useState(user.full_name ?? '');
  const [phone, setPhone] = useState(user.phone ?? '');
  const [address, setAddress] = useState(user.address ?? '');
  const [errors, setErrors] = useState<CustomerDataErrors>({});
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;

    const data = { full_name: fullName.trim(), phone: phone.trim(), address: address.trim() };
    const nextErrors = validateCustomerData(data);
    setErrors(nextErrors);
    setFeedback(null);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    try {
      await updateProfile(data);
      setFeedback({ type: 'success', message: 'Tus datos se guardaron correctamente.' });
    } catch (err) {
      setFeedback({ type: 'error', message: getErrorMessage(err, 'No pudimos guardar tus datos.') });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div>
        <label htmlFor="profile-email" className="block text-sm font-medium text-gray-700 mb-1">
          Email
        </label>
        <input
          id="profile-email"
          type="email"
          value={user.email}
          readOnly
          className={`${INPUT_CLASS} bg-gray-100 text-gray-500 cursor-not-allowed`}
        />
      </div>

      <div>
        <label htmlFor="profile-name" className="block text-sm font-medium text-gray-700 mb-1">
          Nombre
        </label>
        <input
          id="profile-name"
          type="text"
          autoComplete="name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className={INPUT_CLASS}
        />
        {errors.full_name && <p className="text-xs text-red-600 mt-1">{errors.full_name}</p>}
      </div>

      <div>
        <label htmlFor="profile-phone" className="block text-sm font-medium text-gray-700 mb-1">
          Teléfono
        </label>
        <input
          id="profile-phone"
          type="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className={INPUT_CLASS}
        />
        {errors.phone && <p className="text-xs text-red-600 mt-1">{errors.phone}</p>}
      </div>

      <div>
        <label htmlFor="profile-address" className="block text-sm font-medium text-gray-700 mb-1">
          Dirección
        </label>
        <input
          id="profile-address"
          type="text"
          autoComplete="street-address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          className={INPUT_CLASS}
        />
        {errors.address && <p className="text-xs text-red-600 mt-1">{errors.address}</p>}
      </div>

      {feedback && (
        <div
          role={feedback.type === 'error' ? 'alert' : 'status'}
          className={`rounded-xl px-4 py-3 text-sm ${
            feedback.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'
          }`}
        >
          {feedback.message}
        </div>
      )}

      <button
        type="submit"
        disabled={saving}
        className="w-full bg-black text-white rounded-xl py-2.5 font-semibold hover:bg-gray-800 transition disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {saving ? 'Guardando...' : 'Guardar cambios'}
      </button>
    </form>
  );
}

export default function ProfilePage() {
  const { user, isCustomer, isLoading } = useAuth();

  if (!isLoading && !isCustomer) {
    return <Navigate to="/menu" replace />;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <TopBar actions={<CustomerAccountActions />} />
      <main className="flex-1 px-4 py-10">
        <div className="bg-white rounded-2xl shadow-md p-6 max-w-lg mx-auto">
          <Link to="/menu" className="text-sm text-gray-500 hover:text-gray-900 transition">
            ← Volver al menú
          </Link>
          <h1 className="text-xl font-bold text-gray-900 mt-3 mb-1">Mi perfil</h1>
          <p className="text-sm text-gray-500 mb-6">
            Estos datos se usan para completar automáticamente tus pedidos.
          </p>

          {isLoading || !user ? (
            <p className="text-sm text-gray-500 text-center py-8">Cargando...</p>
          ) : (
            <ProfileForm user={user} />
          )}
        </div>
      </main>
    </div>
  );
}
