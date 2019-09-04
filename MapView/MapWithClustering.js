import React, { Component } from 'react';
import PropTypes from 'prop-types';
import MapView from 'react-native-maps';
import { width as w, height as h } from 'react-native-dimension';
import SuperCluster from 'supercluster';
import CustomMarker from './CustomMarker';

export default class MapWithClustering extends Component {
  state = {
    currentRegion: this.props.initialRegion || this.props.region,
    currentChildren: this.props.children,
    cluster: {
      justifyContent: 'center',
      alignItems: 'center',
      width: 40,
      height: 40,
      borderRadius: 20,
      borderColor: '#FFFFFF',
      borderWidth: this.props.clusterBorderWidth
    },
    clusterStyleRed: {
      backgroundColor: 'rgb(255, 0, 91)',
    },
    clusterStyleBlue: {
      backgroundColor: 'rgb(52, 150, 206)'
    },
    clusterStyleGrey: {
      backgroundColor: 'rgb(208, 209, 213)'
    },
    clusterTextStyle: {
      fontSize: this.props.clusterTextSize,
      color: '#FFFFFF',
      fontWeight: 'bold',
    },
  };

  componentDidMount() {
    this.createMarkersOnMap();
  }

  static getDerivedStateFromProps(nextProps, prevState) {
    if (nextProps.children != prevState.currentChildren) {
      return {
        currentChildren: nextProps.children
      };
    } else {
      return null
    }
  }
  componentDidUpdate(prevProps, prevState) {
    if (this.props.children !== prevProps.children) {
      this.createMarkersOnMap(this.state.currentChildren);
    }
  }

  onRegionChangeComplete = (region) => {
    const { latitude, latitudeDelta, longitude, longitudeDelta } = this.state.currentRegion;
    if (region.longitudeDelta <= 80) {
      if ((Math.abs(region.latitudeDelta - latitudeDelta) > latitudeDelta / 8)
        || (Math.abs(region.longitude - longitude) >= longitudeDelta / 5)
        || (Math.abs(region.latitude - latitude) >= latitudeDelta / 5)) {
        this.calculateClustersForMap(region);
      }
    }
    if(this.props.onRegionChangeComplete)
      this.props.onRegionChangeComplete(region)
  };

  createMarkersOnMap = () => {
    const otherChildren = [];

    let clustersGroups = {};

    React.Children.forEach(this.props.children, (marker) => {
      if (marker !== null) {
        if (marker.props && marker.props.coordinate && marker.props.cluster !== false && marker.props.type) {
          clustersGroups[marker.props.type] = clustersGroups[marker.props.type] || [];

          clustersGroups[marker.props.type].push({
            marker,
            properties: { point_count: 0 },
            geometry: {
              type: 'Point',
              coordinates: [
                marker.props.coordinate.longitude,
                marker.props.coordinate.latitude,
              ],
            },
          });

        } else {
          otherChildren.push(marker);
        }
      } 
    });

    clustersGroups = Object.entries(clustersGroups).reduce((res, [type, group]) => {
      res[type] = SuperCluster({
        radius: this.props.radius,
        maxZoom: 20,
        minZoom: 1,
      });

      res[type].load(group);

      return res;
    }, {});

    this.setState({
      clustersGroups,
      otherChildren,
    }, () => {
      this.calculateClustersForMap();
    });
  };

  calculateBBox = region => [
    region.longitude - region.longitudeDelta, // westLng - min lng
    region.latitude - region.latitudeDelta, // southLat - min lat
    region.longitude + region.longitudeDelta , // eastLng - max lng
    region.latitude + region.latitudeDelta// northLat - max lat
  ];

  getBoundsZoomLevel = (bounds, mapDim) => {
    const WORLD_DIM = { height: mapDim.height, width: mapDim.width };
    const ZOOM_MAX = 20;

    function latRad(lat) {
      const sin = Math.sin(lat * Math.PI / 180);
      const radX2 = Math.log((1 + sin) / (1 - sin)) / 2;
      return Math.max(Math.min(radX2, Math.PI), -Math.PI) / 2;
    }

    function zoom(mapPx, worldPx, fraction) {
      return Math.floor(Math.log(mapPx / worldPx / fraction) / Math.LN2);
    }

    const latFraction = (latRad(bounds[3]) - latRad(bounds[1])) / Math.PI;
    const lngDiff = bounds[2] - bounds[0];
    const lngFraction = ((lngDiff < 0) ? (lngDiff + 360) : lngDiff) / 360;
    const latZoom = zoom(mapDim.height, WORLD_DIM.height, latFraction);
    const lngZoom = zoom(mapDim.width, WORLD_DIM.width, lngFraction);

    return Math.min(latZoom, lngZoom, ZOOM_MAX);
  };

  calculateClustersForMap = async (currentRegion = this.state.currentRegion) => {
    const clustersMarkersGroups = {};

    if (this.props.clustering && this.state.clustersGroups) {
      for (let type in this.state.clustersGroups) {
        const superCluster = this.state.clustersGroups[type];

        const bBox = this.calculateBBox(this.state.currentRegion);
        let zoom = this.getBoundsZoomLevel(bBox, { height: h(100), width: w(100) });
        const clusters = await superCluster.getClusters([bBox[0], bBox[1], bBox[2], bBox[3]], zoom);
        const CustomDefinedMarker = this.props.customDefinedMarker || CustomMarker
  
        const clusterStyle = type == 'MAIN_MARKER'
          ? this.state.clusterStyleRed
          : type == 'NOT_ACTIVE_MARKER'
          ? this.state.clusterStyleGrey
          : this.state.clusterStyleBlue;

        clustersMarkersGroups[type] = clusters.map(cluster => (<CustomDefinedMarker
          pointCount={cluster.properties.point_count}
          clusterId={cluster.properties.cluster_id}
          geometry={cluster.geometry}
          clusterStyle={[clusterStyle, this.state.cluster]}
          clusterTextStyle={this.state.clusterTextStyle}
          marker={cluster.properties.point_count === 0 ? cluster.marker : null}
          key={JSON.stringify(cluster.geometry) + cluster.properties.cluster_id + cluster.properties.point_count}
          onClusterPress={this.props.onClusterPress}
        />));
      }
    } else {
      clusteredMarkers = this.state.markers.map(marker => marker.marker);
    }

    this.setState({
      clustersMarkersGroups,
      currentRegion
    });
  };

  removeChildrenFromProps = (props) => {
    const newProps = {};
    Object.keys(props).forEach((key) => {
      if (key !== 'children') {
        newProps[key] = props[key];
      }
    });
    return newProps;
  };

  render() {
    return (
      <MapView 
        ref={(ref) => this.mapView = ref}
        {...this.removeChildrenFromProps(this.props)}
        onRegionChangeComplete={this.onRegionChangeComplete}
      >
        {Object.values(this.state.clustersMarkersGroups || []).map((group) => {
          return group;
        })}
        {this.state.otherChildren}
      </MapView>
    );
  }
}

MapWithClustering.propTypes = {
  region: PropTypes.object,
  clustering: PropTypes.bool,
  radius: PropTypes.number,
  clusterBorderWidth: PropTypes.number,
  clusterTextSize: PropTypes.number,
  onClusterPress: PropTypes.func,
};

const totalSize = num => (Math.sqrt((h(100) * h(100)) + (w(100) * w(100))) * num) / 100;

MapWithClustering.defaultProps = {
  clustering: true,
  radius: w(5),
  clusterBorderWidth: 3,
  clusterTextSize: totalSize(2),
  onClusterPress: () => {},
};
