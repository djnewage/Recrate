import React from 'react';
import { View, Text } from 'react-native';
import { useConnectionStore, CONNECTION_TYPES } from '../store/connectionStore';

const ConnectionBadge = ({ style }) => {
  const { connectionType, isConnected } = useConnectionStore();

  if (!isConnected) return null;

  const badges = {
    [CONNECTION_TYPES.TAILSCALE]: {
      icon: '🌐',
      text: 'Remote',
      color: '#48bb78',
    },
    [CONNECTION_TYPES.LOCAL]: {
      icon: '🏠',
      text: 'Local',
      color: '#4299e1',
    },
    [CONNECTION_TYPES.MANUAL]: {
      icon: '⚙️',
      text: 'Manual',
      color: '#9f7aea',
    },
  };

  const badge = badges[connectionType];
  if (!badge) return null;

  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: badge.color + '20',
          borderColor: badge.color,
          borderWidth: 1,
          borderRadius: 12,
          paddingHorizontal: 10,
          paddingVertical: 5,
        },
        style,
      ]}
    >
      <Text style={{ fontSize: 14, marginRight: 5 }}>{badge.icon}</Text>
      <Text
        style={{
          fontSize: 12,
          fontWeight: '600',
          color: badge.color,
        }}
      >
        {badge.text}
      </Text>
    </View>
  );
};

export default ConnectionBadge;
