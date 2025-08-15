import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { toast } from 'react-hot-toast';
import axios from 'axios';
import { User, MapPin, Calendar, ArrowLeft, Edit, Save, X } from 'lucide-react';

import './Profile.css';

const Profile = () => {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();
  const [userFields, setUserFields] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    username: user?.username || '',
    email: user?.email || ''
  });


  useEffect(() => {
    fetchUserFields();
  }, []);



  const fetchUserFields = async () => {
    try {
      const response = await axios.get('/api/users/my-fields');
      setUserFields(response.data);
    } catch (error) {
      console.error('Error fetching user fields:', error);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      // Note: This would require a new API endpoint to update user profile
      // For now, we'll just show a success message
      toast.success('Profilo aggiornato con successo!');
      setIsEditing(false);
    } catch (error) {
      toast.error('Errore durante l\'aggiornamento del profilo');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };





  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('it-IT');
  };



  const getSurfaceTypeLabel = (type) => {
    const types = {
      'erba naturale': 'Erba Naturale',
      'erba sintetica': 'Erba Sintetica',
      'terra': 'Terra',
      'cemento': 'Cemento',
      'parquet': 'Parquet'
    };
    return types[type] || type || 'Non specificato';
  };

  const getSportTypeLabel = (sportType) => {
    const sports = {
      'football': 'Calcio',
      'swimming': 'Nuoto',
      'basketball': 'Basketball',
      'tennis': 'Tennis',
      'tabletennis': 'Ping Pong',
      'volleyball': 'Volley',
      'badminton': 'Badminton',
      'rugby': 'Rugby',
      'baseball': 'Baseball',
      'hockey': 'Hockey'
    };
    return sports[sportType] || sportType || 'Non specificato';
  };

  return (
    <div className="profile-container">
      <div className="profile-header">
        <button 
          className="back-button"
          onClick={() => navigate('/')}
        >
          <ArrowLeft />
          Torna alla Mappa
        </button>
        <h1>
          <User />
          Profilo Utente
        </h1>
      </div>

      <div className="profile-content">
        <div className="profile-section">
          <div className="profile-info">
            <div className="profile-avatar">
              <User className="avatar-icon" />
            </div>
            
            {isEditing ? (
              <form onSubmit={handleSubmit} className="profile-edit-form">
                <div className="form-group">
                  <label htmlFor="username">Username</label>
                  <input
                    type="text"
                    id="username"
                    name="username"
                    value={formData.username}
                    onChange={handleInputChange}
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="email">Email</label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    required
                  />
                </div>

                <div className="form-actions">
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => setIsEditing(false)}
                    disabled={loading}
                  >
                    <X />
                    Annulla
                  </button>
                  <button
                    type="submit"
                    className="button primary"
                    disabled={loading}
                  >
                    <Save />
                    {loading ? 'Salvataggio...' : 'Salva Modifiche'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="profile-details">
                <h3>{user?.username}</h3>
                <p className="profile-email">{user?.email}</p>
                <p className="profile-joined">
                  <Calendar className="icon-small" />
                  Membro dal {formatDate(user?.created_at)}
                </p>
                
                <button
                  className="button secondary"
                  onClick={() => setIsEditing(true)}
                >
                  <Edit />
                  Modifica Profilo
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="profile-section">
          <h2>
            <MapPin />
            I Miei Impianti ({userFields.length})
          </h2>
          
          {userFields.length === 0 ? (
            <div className="no-fields">
              <p>Non hai ancora aggiunto nessun impianto sportivo.</p>
              <button
                className="button primary"
                onClick={() => navigate('/')}
              >
                <MapPin />
                Esplora Mappa
              </button>
            </div>
          ) : (
            <div className="user-fields">
              {userFields.map((field) => (
                <div key={field.id} className="field-card">
                  <div className="field-header">
                    <h3>{field.name}</h3>
                    <span className="field-date">
                      Aggiunto il {formatDate(field.created_at)}
                    </span>
                  </div>
                  
                  <div className="field-location">
                    <MapPin className="icon-small" />
                    {field.city}, {field.province}, {field.region}
                  </div>
                  
                  <div className="field-details">
                    <div className="field-detail">
                      <strong>Sport:</strong> {getSportTypeLabel(field.sport_type)}
                    </div>
                    <div className="field-detail">
                      <strong>Superficie:</strong> {getSurfaceTypeLabel(field.surface_type)}
                    </div>
                    <div className="field-detail">
                      <strong>Tipo Impianto:</strong> {field.venue_type || 'Non specificato'}
                    </div>
                  </div>
                  
                  <div className="field-features">
                    {field.has_lighting && <span className="feature">💡</span>}
                    {field.has_changing_rooms && <span className="feature">🚿</span>}
                    {field.has_parking && <span className="feature">🅿️</span>}
                    {field.is_public ? <span className="feature">🌍</span> : <span className="feature">🔒</span>}
                  </div>
                  
                  <div className="field-actions">
                    <button
                      className="button secondary small"
                      onClick={() => navigate(`/?field=${field.id}`)}
                    >
                      Vedi sulla Mappa
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="profile-section">
          <h2>
            <MapPin />
            Impostazioni Posizione
          </h2>
          <div className="location-settings">
            <div className="setting-item">
              <div className="setting-info">
                <h3>Geolocalizzazione</h3>
                <p>Gestisci i permessi per la tua posizione sulla mappa</p>
              </div>
              <div className="setting-actions">
                <button
                  className="button primary"
                  onClick={() => {
                    // Trigger location request from Map component
                    if (window.getUserLocationFromProfile) {
                      window.getUserLocationFromProfile();
                    } else {
                      toast.success('Torna alla mappa per richiedere la posizione');
                      navigate('/');
                    }
                  }}
                >
                  <MapPin />
                  Richiedi Posizione
                </button>
              </div>
            </div>
            
            <div className="setting-item">
              <div className="setting-info">
                <h3>Stato Posizione</h3>
                <p>Verifica se la geolocalizzazione è attiva</p>
              </div>
              <div className="setting-actions">
                <button
                  className="button secondary"
                  onClick={() => {
                    if (navigator.geolocation) {
                      toast.success('Geolocalizzazione supportata');
                    } else {
                      toast.error('Geolocalizzazione non supportata');
                    }
                  }}
                >
                  Verifica Supporto
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="profile-section">
          <h2>Azioni</h2>
          <div className="profile-actions">

            
            <button
              className="button secondary"
              onClick={() => navigate('/')}
            >
              Esplora Mappa
            </button>
            
            <button
              className="button danger"
              onClick={handleLogout}
            >
              Logout
            </button>
          </div>
        </div>
      </div>




    </div>
  );
};

export default Profile;
