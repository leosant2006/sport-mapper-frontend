import React, { useState, useEffect, useContext, forwardRef, useImperativeHandle, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap } from 'react-leaflet';
import { toast } from 'react-hot-toast';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';
import { MapPin } from 'lucide-react';
import SimpleFieldModal from './SimpleFieldModal';
import FilterModal from './FilterModal';
import CompactSportModal from './CompactSportModal';
import AddFieldModal from './AddFieldModal';


import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Sport icons mapping
const sportIcons = {
  football: '⚽',
  swimming: '🏊',
  basketball: '🏀',
  tennis: '🎾',
  tabletennis: '🏓',
  volleyball: '🏐',
  badminton: '🏸',
  rugby: '🏉',
  baseball: '⚾',
  hockey: '🏒'
};

// Modern Google Maps style marker with sport-specific icons
const createSportIcon = (sportType, isPublic) => {
  const color = isPublic ? '#34a853' : '#fbbc04';
  const icon = sportIcons[sportType] || '⚽';
  
  return L.divIcon({
    html: `
      <div style="
        width: 32px;
        height: 32px;
        background: ${color};
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        border: 2px solid white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-weight: bold;
        font-size: 14px;
        cursor: pointer;
        transition: all 0.2s ease;
        position: relative;
      ">
        <div style="
          transform: rotate(45deg);
          font-size: 16px;
        ">
          ${icon}
        </div>
      </div>
    `,
    className: 'sport-marker',
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32]
  });
};

// User location marker icon
const createUserLocationIcon = () => {
  return L.divIcon({
    html: `
      <div style="
        width: 20px;
        height: 20px;
        background: #3b82f6;
        border-radius: 50%;
        border: 3px solid white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        animation: pulse 2s infinite;
      ">
      </div>
      <style>
        @keyframes pulse {
          0% {
            transform: scale(1);
            opacity: 1;
          }
          50% {
            transform: scale(1.2);
            opacity: 0.7;
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }
      </style>
    `,
    className: 'user-location-marker',
    iconSize: [20, 20],
    iconAnchor: [10, 10]
  });
};

// Fix for default markers in Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
});

// Component to handle map clicks
const MapClickHandler = ({ onMapClick }) => {
  useMapEvents({
    click: (e) => {
      onMapClick(e.latlng);
    },
  });
  return null;
};

// Component to handle map loading
const MapLoadHandler = ({ onMapLoad }) => {
  const map = useMap();
  
  useEffect(() => {
    const handleMapLoad = () => {
      setTimeout(() => {
        onMapLoad();
      }, 100);
    };

    if (map) {
      map.whenReady(handleMapLoad);
    }
  }, [map, onMapLoad]);

  return null;
};

// Component to center map on user location
const CenterOnUserLocation = ({ userLocation }) => {
  const map = useMap();
  
  useEffect(() => {
    if (userLocation) {
      map.setView([userLocation.lat, userLocation.lng], 15);
    }
  }, [userLocation, map]);
  
  return null;
};





const Map = forwardRef((props, ref) => {
  const [fields, setFields] = useState([]);
  const [selectedField, setSelectedField] = useState(null);
  const [showFieldModal, setShowFieldModal] = useState(false);
  const [showFilterModal, setShowFilterModal] = useState(false);

  const [filters, setFilters] = useState({});
  const [loading, setLoading] = useState(true);
  const [userLocation, setUserLocation] = useState(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState(null);
  const [showSportSelectionModal, setShowSportSelectionModal] = useState(false);
  const [showAddFieldModal, setShowAddFieldModal] = useState(false);
  const [selectedSport, setSelectedSport] = useState(null);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [isSelectingLocationForEdit, setIsSelectingLocationForEdit] = useState(false);
  const [fieldToEditLocation, setFieldToEditLocation] = useState(null);

  const [mapLoaded, setMapLoaded] = useState(false);
  const mapRef = useRef(null);
  const { user } = useContext(AuthContext);

  useImperativeHandle(ref, () => ({
    openFilterModal: () => setShowFilterModal(true)
  }));

  // Get user location automatically
  const getUserLocation = () => {
    if (!navigator.geolocation) {
      setLocationError('La geolocalizzazione non è supportata dal tuo browser');
      return;
    }

    setLocationLoading(true);
    setLocationError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setUserLocation({ lat: latitude, lng: longitude });
        setLocationLoading(false);
      },
      (error) => {
        console.error('Geolocation error:', error);
        setLocationLoading(false);
        let errorMessage = 'Errore nel rilevamento della posizione';
        
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = 'Permesso di geolocalizzazione negato';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage = 'Posizione non disponibile';
            break;
          case error.TIMEOUT:
            errorMessage = 'Timeout nel rilevamento della posizione';
            break;
          default:
            errorMessage = 'Errore sconosciuto nel rilevamento della posizione';
            break;
        }
        
        setLocationError(errorMessage);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000
      }
    );
  };

  // Fetch fields from API
  const fetchFields = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      Object.keys(filters).forEach(key => {
        if (filters[key]) params.append(key, filters[key]);
      });
      
      console.log('Fetching fields from API...');
      console.log('URL:', `/api/fields?${params}`);
      
      const response = await axios.get(`/api/fields?${params}`);
      console.log('Fields received:', response.data);
      console.log('Number of fields:', response.data.length);
      
      if (Array.isArray(response.data)) {
        setFields(response.data);
      } else {
        console.error('Response is not an array:', response.data);
        setFields([]);
      }
    } catch (error) {
      console.error('Error fetching fields:', error);
      console.error('Error details:', error.response?.data || error.message);
      toast.error(`Errore nel caricamento dei campi: ${error.message}`);
      setFields([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFields();
  }, [filters]);

  // Automatically get user location when component mounts
  useEffect(() => {
    // Check if geolocation is supported
    if (!navigator.geolocation) {
      setLocationError('La geolocalizzazione non è supportata dal tuo browser');
      return;
    }
    
    // Check if we're on HTTPS (required for geolocation on iOS)
    if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
      setLocationError('La geolocalizzazione richiede HTTPS su dispositivi mobili');
      return;
    }
    
    getUserLocation();
  }, []);



  const handleFieldClick = (field) => {
    setSelectedField(field);
    setShowFieldModal(true);
  };

  const handleCloseModal = () => {
    setShowFieldModal(false);
    setSelectedField(null);
  };

  const handleFilterChange = (newFilters) => {
    setFilters(newFilters);
    setShowFilterModal(false);
  };

  const handleSportSelect = (sport) => {
    setSelectedSport(sport);
    setShowSportSelectionModal(false);
    setShowAddFieldModal(true);
  };

  const handleAddFieldSuccess = () => {
    setShowAddFieldModal(false);
    setSelectedSport(null);
    setSelectedLocation(null);
    // Refresh the page to show the new field
    window.location.reload();
  };

  const handleStartLocationSelectionForEdit = (field) => {
    console.log('Map: handleStartLocationSelectionForEdit called with field:', field);
    setSelectedField(field);
    setIsSelectingLocationForEdit(true);
    setFieldToEditLocation(field);
    setShowFieldModal(false); // Close SimpleFieldModal
    console.log('Map: isSelectingLocationForEdit set to true');
  };

  const handleMapClick = (latlng) => {
    
    // If we're in location selection mode for editing, handle it
    if (isSelectingLocationForEdit && fieldToEditLocation) {
      // Get address from reverse geocoding
      fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latlng.lat}&lon=${latlng.lng}&addressdetails=1`)
        .then(response => response.json())
        .then(data => {
          let address = null;
          if (data.address) {
            address = {
              address: data.display_name,
              city: data.address.city || data.address.town || data.address.village || '',
              province: data.address.county || '',
              region: data.address.state || ''
            };
          }
          console.log('Map: calling locationSelectCallbackForEdit with latlng:', latlng, 'address:', address);
          if (window.locationSelectCallbackForEdit) {
            window.locationSelectCallbackForEdit(latlng, address);
          } else {
            console.log('Map: locationSelectCallbackForEdit is not set');
          }
          setIsSelectingLocationForEdit(false);
          setFieldToEditLocation(null);
        })
        .catch(error => {
          console.error('Error reverse geocoding:', error);
          if (window.locationSelectCallbackForEdit) {
            window.locationSelectCallbackForEdit(latlng, null);
          }
          setIsSelectingLocationForEdit(false);
          setFieldToEditLocation(null);
        });
      return;
    }

    // If we're in location selection mode, call the callback and reopen modal
    if (window.locationSelectCallback) {
      // Get address from reverse geocoding
      fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latlng.lat}&lon=${latlng.lng}&addressdetails=1`)
        .then(response => response.json())
        .then(data => {
          let address = null;
          if (data.address) {
            address = {
              address: data.display_name,
              city: data.address.city || data.address.town || data.address.village || '',
              province: data.address.county || '',
              region: data.address.state || ''
            };
          }
          window.locationSelectCallback(latlng, address);
          // Don't reset locationSelectCallback here - let the callback handle it
        })
        .catch(error => {
          console.error('Error reverse geocoding:', error);
          window.locationSelectCallback(latlng, null);
          // Don't reset locationSelectCallback here - let the callback handle it
        });
      return;
    }
    
    // If we have a tempSelectedSport, we're in location selection mode
    if (window.tempSelectedSport) {
      // Get address from reverse geocoding
      fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latlng.lat}&lon=${latlng.lng}&addressdetails=1`)
        .then(response => response.json())
        .then(data => {
          let address = null;
          if (data.address) {
            address = {
              address: data.display_name,
              city: data.address.city || data.address.town || data.address.village || '',
              province: data.address.county || '',
              region: data.address.state || ''
            };
          }
          window.detectedAddress = address;
          window.selectedLocation = latlng;
          reopenModalWithLocation(latlng);
        })
        .catch(error => {
          console.error('Error reverse geocoding:', error);
          window.detectedAddress = null;
          window.selectedLocation = latlng;
          reopenModalWithLocation(latlng);
        });
      return;
    }
    
    // Normal venue addition mode - check if we already have a selected sport
    if (user) {
      setSelectedLocation(latlng);
      
      // If we already have a selected sport, go directly to add field modal
      if (selectedSport) {
        setShowAddFieldModal(true);
      } else {
        // Otherwise, open sport selection modal
        setShowSportSelectionModal(true);
      }
    } else {
      toast.error('Devi essere loggato per aggiungere un impianto sportivo');
    }
  };





  const handleLocationSelect = (callback) => {
    window.locationSelectCallback = callback;
    // Don't reset selectedSport here - keep it for when modal reopens
    toast('Clicca sulla mappa per selezionare la posizione', {
      icon: '🗺️',
      duration: 3000
    });
  };

  // Function to reopen modal after location selection
  const reopenModalWithLocation = (location) => {
    // Instead of opening our own modal, communicate with Navbar
    if (window.reopenModalWithLocationFromMap) {
      window.reopenModalWithLocationFromMap(location);
    }
  };

  // Expose the function globally for Navbar component
  useEffect(() => {
    window.handleLocationSelect = handleLocationSelect;
    window.reopenModalWithLocation = reopenModalWithLocation;
    window.getUserLocationFromProfile = getUserLocation;
    return () => {
      delete window.handleLocationSelect;
      delete window.reopenModalWithLocation;
      delete window.getUserLocationFromProfile;
    };
  }, []);

  if (loading) {
    return (
      <div className="map-container">
        <div className="loading">Caricamento mappa...</div>
      </div>
    );
  }

  return (
    <div className="map-container">
      

      
      {/* Location loading indicator */}
      {locationLoading && (
        <div style={{
          position: 'absolute',
          bottom: '20px',
          right: '20px',
          zIndex: 1000,
          background: 'rgba(0,0,0,0.8)',
          color: 'white',
          padding: '8px 12px',
          borderRadius: '6px',
          fontSize: '12px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px'
        }}>
          <div style={{
            width: '12px',
            height: '12px',
            border: '2px solid #ffffff',
            borderTop: '2px solid transparent',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
          }}></div>
          Rilevando posizione...
          <style>{`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      )}

      {/* Location error indicator */}
      {locationError && (
        <div style={{
          position: 'absolute',
          bottom: '20px',
          right: '20px',
          zIndex: 1000,
          background: '#fee2e2',
          color: '#dc2626',
          padding: '8px 12px',
          borderRadius: '6px',
          fontSize: '12px',
          maxWidth: '200px',
          border: '1px solid #fecaca'
        }}>
          ⚠️ {locationError}
          <div style={{ fontSize: '10px', marginTop: '4px', color: '#9b1c1c' }}>
            Vai nelle Impostazioni per riprovare
          </div>
        </div>
      )}

      <MapContainer
        center={[41.9028, 12.4964]}
        zoom={6}
        style={{ height: '100%', width: '100%' }}
        className="map"
        zoomControl={true}
        scrollWheelZoom={true}
        doubleClickZoom={true}
        dragging={true}
        attributionControl={false}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        />

        <MapClickHandler onMapClick={handleMapClick} />
        <MapLoadHandler onMapLoad={() => setMapLoaded(true)} />
        <CenterOnUserLocation userLocation={userLocation} />

        {fields.map((field) => (
          <Marker
            key={field.id}
            position={[parseFloat(field.latitude), parseFloat(field.longitude)]}
            icon={createSportIcon(field.sport_type, field.is_public)}
          >
            <Popup>
              <div className="marker-popup">
                <h3>{field.name}</h3>
                <p><strong>Sport:</strong> {field.sport_type}</p>
                <p><strong>Indirizzo:</strong> {field.address}, {field.city}</p>
                <p><strong>Superficie:</strong> {field.surface_type}</p>
                <p><strong>Tipo:</strong> {field.venue_type}</p>
                {field.added_by_username && (
                  <p><strong>Aggiunto da:</strong> {field.added_by_username}</p>
                )}
                <button
                  className="popup-button"
                  onClick={() => handleFieldClick(field)}
                >
                  <MapPin size={16} />
                  Dettagli
                </button>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* User location marker */}
        {userLocation && (
          <Marker
            position={[userLocation.lat, userLocation.lng]}
            icon={createUserLocationIcon()}
          >
            <Popup>
              <div className="marker-popup">
                <h3>📍 La tua posizione</h3>
                <p><strong>Latitudine:</strong> {userLocation.lat.toFixed(6)}</p>
                <p><strong>Longitudine:</strong> {userLocation.lng.toFixed(6)}</p>
              </div>
            </Popup>
          </Marker>
        )}
      </MapContainer>
      
      {showFieldModal && selectedField && !isSelectingLocationForEdit && (
        <SimpleFieldModal 
          field={selectedField} 
          isOpen={showFieldModal}
          onClose={handleCloseModal}
          onUpdate={fetchFields}
          onStartLocationSelection={handleStartLocationSelectionForEdit}
        />
      )}
      
      {showFilterModal && (
        <FilterModal 
          filters={filters}
          onFilterChange={handleFilterChange}
          onClose={() => setShowFilterModal(false)}
        />
      )}

      {/* Sport Selection Modal */}
      {showSportSelectionModal && (
        <CompactSportModal
          isOpen={showSportSelectionModal}
          onClose={() => setShowSportSelectionModal(false)}
          onSportSelect={handleSportSelect}
        />
      )}
      
      {/* Add Field Modal */}

      {showAddFieldModal && (
        <AddFieldModal
          location={selectedLocation}
          sport={selectedSport}
          onClose={() => {
            setShowAddFieldModal(false);
            setSelectedSport(null);
            setSelectedLocation(null);
          }}
          onSuccess={handleAddFieldSuccess}
          isFromNavbar={false}
          onChangeSport={() => {
            setShowAddFieldModal(false);
            setShowSportSelectionModal(true);
          }}
        />
      )}

      {/* Location Selection Modal for Editing */}
      {console.log('Map: rendering location selection modal, isSelectingLocationForEdit:', isSelectingLocationForEdit)}
      {isSelectingLocationForEdit && (
        <div className="modal-overlay location-selection" style={{ zIndex: 10001 }}>
          <div className="modal-content" style={{ textAlign: 'center' }}>
            <div style={{ padding: '20px 16px' }}>
              <MapPin size={32} style={{ color: '#3b82f6', marginBottom: '12px' }} />
              <h3 style={{ marginBottom: '8px', color: '#374151', fontSize: '16px', fontWeight: '600' }}>
                🎯 Seleziona Nuova Posizione
              </h3>
              <p style={{ color: '#6b7280', fontSize: '13px', lineHeight: '1.4', marginBottom: '16px' }}>
                <strong>Clicca sulla mappa</strong> per spostare il campo nella nuova posizione
              </p>
              <div style={{ 
                background: '#dcfce7', 
                padding: '8px 12px', 
                borderRadius: '6px', 
                border: '1px solid #bbf7d0',
                marginBottom: '16px'
              }}>
                <div style={{ fontSize: '11px', color: '#166534', fontWeight: '500' }}>
                  💾 Il campo verrà salvato automaticamente dopo la selezione
                </div>
              </div>

              <div style={{ 
                background: '#f0f9ff', 
                padding: '8px 12px', 
                borderRadius: '6px', 
                border: '1px solid #bae6fd',
                marginBottom: '16px'
              }}>
                <div style={{ fontSize: '11px', color: '#0369a1', fontWeight: '500' }}>
                  💡 La mappa è ora completamente visibile e cliccabile
                </div>
              </div>
              <div style={{ 
                background: '#fef3c7', 
                padding: '8px 12px', 
                borderRadius: '6px', 
                border: '1px solid #fbbf24',
                marginBottom: '16px'
              }}>
                <div style={{ fontSize: '11px', color: '#92400e', fontWeight: '500' }}>
                  ⚠️ Se vedi ancora finestre aperte, clicca "Chiudi Tutto"
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                <button
                  type="button"
                  onClick={() => {
                    setIsSelectingLocationForEdit(false);
                    setFieldToEditLocation(null);
                    setShowFieldModal(true); // Reopen parent modal
                  }}
                  style={{
                    background: '#6b7280',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '8px 16px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: '500'
                  }}
                >
                  Annulla Selezione
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Map Legend */}
      {mapLoaded && (
        <div className="map-legend">
          <h4>Legenda Impianti Sportivi</h4>
          <div className="legend-item">
            <div className="legend-icon legend-icon-green">
              <div style={{ 
                width: '8px', 
                height: '8px', 
                backgroundColor: 'white', 
                borderRadius: '50%',
                transform: 'rotate(45deg)'
              }}></div>
            </div>
            <span className="legend-text">Impianto Pubblico</span>
          </div>
          <div className="legend-item">
            <div className="legend-icon legend-icon-yellow">
              <div style={{ 
                width: '8px', 
                height: '8px', 
                backgroundColor: 'white', 
                borderRadius: '50%',
                transform: 'rotate(45deg)'
              }}></div>
            </div>
            <span className="legend-text">Impianto Privato</span>
          </div>
          <div className="legend-sports">
            <p><strong>Sport disponibili:</strong></p>
            <div className="sport-icons">
              <span title="Calcio">⚽</span>
              <span title="Nuoto">🏊</span>
              <span title="Basketball">🏀</span>
              <span title="Tennis">🎾</span>
              <span title="Ping Pong">🏓</span>
              <span title="Volley">🏐</span>
              <span title="Badminton">🏸</span>
              <span title="Rugby">🏉</span>
              <span title="Baseball">⚾</span>
              <span title="Hockey">🏒</span>
            </div>
          </div>
        </div>
      )}




    </div>
  );
});

export default Map;
