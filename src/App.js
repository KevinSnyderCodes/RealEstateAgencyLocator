/* global google */

import React, { Component } from 'react';
// import logo from './logo.svg';
import './App.css';

// Basic functions, constants, non-specific to components

const TEN_MILES_IN_METERS = 16093; // Slightly under 10 miles
function sum(a, b) {
  return a + b;
}
function metersToMiles(n) {
     return n * 0.000621371192;
}

// Google Maps

var austin = new google.maps.LatLng(30.311243, -97.748604);

// React

class Address extends Component {
  constructor(props) {
    super(props);
    this.state = {
      isSet: false
    };

    this.handleChange = this.handleChange.bind(this);
  }

  componentDidMount() {
    this.autocomplete = new google.maps.places.Autocomplete(this.input);
    google.maps.event.addListener(this.autocomplete, 'place_changed', () => {
      this.setState(() => {
        return {
          isSet: this.autocomplete.getPlace() !== undefined
        };
      });
    });
  }

  handleChange() {
    console.log("handleChange", this.autocomplete);
    this.autocomplete.set('place', undefined);
    this.setState(() => {
      return {
        isSet: false
      };
    });
  }

  render() {
    let classes = (this.state.isSet ? 'isSet' : '');
    return (
      <input
        id={this.props.id}
        className={classes}
        type="text"
        onChange={this.handleChange}
        ref={(elem) => {
          this.input = elem;
        }}
      />
    );
  }
}

class AddressForm extends Component {
  constructor(props) {
    super(props);

    let numAddresses = 2; // Default
    if (this.props.numAddresses !== undefined) {
      numAddresses = Number(this.props.numAddresses);
    }
    this.state = {
      numAddresses: numAddresses
    };

    this.addAddress = this.addAddress.bind(this);
    this.removeAddress = this.removeAddress.bind(this);
    this.submit = this.submit.bind(this);
  }

  addAddress(event) {
    this.setState((prevState) => {
      return {
        numAddresses: prevState.numAddresses+1
      };
    });
  }

  removeAddress(event) {
    if (this.state.numAddresses > 1) {
      this.setState((prevState) => {
        return {
          numAddresses: prevState.numAddresses-1
        };
      });
    }
  }

  submit(event) {
    console.log("submit");
    event.preventDefault();
    let places = [];
    for (var i = 0; i < this.state.numAddresses; i++) {
      let place = this.refs['address' + (i+1)].autocomplete.getPlace();
      if (place === undefined) {
        alert(
          'Address ' + (i+1) + ' is not set.\n\nBegin typing an address and select from the dropdown list.'
        );
        return;
      }
      places.push(place);
    }
    this.props.callback(places);
  }

  render() {
    const addresses = [];
    for (var i = 0; i < this.state.numAddresses; i++) {
      let id = 'address' + (i+1);
      addresses.push(
        <div className="address" key={i}>
          <Address id={id} ref={id} />
        </div>
      );
    }
    return(
      <div className="AddressForm">
        {addresses}
        <div className="buttons">
          <img className="icon" src={process.env.PUBLIC_URL + '/plus.png'} alt="Add" onClick={this.addAddress} />
          <img className="icon" src={process.env.PUBLIC_URL + '/minus.png'} alt="Remove" onClick={this.removeAddress} />
          <button onClick={this.submit}>Submit</button>
        </div>
      </div>
    );
  }
}

class Results extends Component {
  constructor(props) {
    super(props);
    this.state = {
      agencies: [],
      searching: false
    };

    this.processPlaces = this.processPlaces.bind(this);
  }

  componentDidMount() {
    this.map = new google.maps.Map(document.getElementById('map'), {
      center: austin,
      zoom: 8
    });
    this.placesService = new google.maps.places.PlacesService(this.map);
  }

  processPlaces(places) {
    // Clear out old agencies
    this.setState(() => {
      return {
        agencies: [],
        searching: true
      };
    });

    const service = this.placesService;

    const agencies = [];
    const set = new Set();

    function processPlace(place) {
      return new Promise((resolve, reject) => {
        let request = {
          location: place.geometry.location,
          radius: String(TEN_MILES_IN_METERS),
          type: ['real_estate_agency'],
          query: 'real estate agency'
        };
        // Text-based search provides better results, though
        // it is only bias (not strict) towards the radius.
        // We can remove results outside this limit later.
        service.textSearch(request, (results, status, pagination) => {
          for (let i = 0; i < results.length; i++) {
            let result = results[i];
            console.log(result);
            // Google Maps API includes hotels in a search for
            // 'real_estate_agency'. A proper agency wouldn't
            // have 'lodging', so ignore any results with that
            // type.
            if (result.types.indexOf("lodging") === -1 && !set.has(result.place_id)) {
              agencies.push(result);
              set.add(result.place_id);
            }
          }
          if (pagination.hasNextPage) {
            pagination.nextPage();
          }
          else {
            resolve();
          }
        });
      });
    }

    function compareSumDistance(a, b) {
      let sumA = a.distanceFromAddress.reduce(sum);
      let sumB = b.distanceFromAddress.reduce(sum);
      return sumA > sumB;
    }

    let functionSeries = places.map((place) => {
      return () => {
        return processPlace(place);
      };
    });
    functionSeries.reduce((prev, curr) => {
      return prev.then(curr);
    }, Promise.resolve())
    .then(() => {
      console.log("All promises fulfilled!", agencies.length);
      // Remove locations too far away, and get distance from
      // addresses at the same time
      for (let i = 0; i < agencies.length; i++) {
        agencies[i].distanceFromAddress = [];
        let inRange = false;
        for (let j = 0; j < places.length; j++) {
          agencies[i].distanceFromAddress[j] = google.maps.geometry.spherical.computeDistanceBetween(
            agencies[i].geometry.location,
            places[j].geometry.location
          );
          inRange = inRange || agencies[i].distanceFromAddress[j] < TEN_MILES_IN_METERS;
        }
        if (!inRange) {
          agencies.splice(i, 1);
          i--;
        }
      }
      // Sort locations by sum of distances
      agencies.sort(compareSumDistance);
      // Set state
      this.setState(() => {
        return {
          agencies: agencies,
          searching: false
        };
      });
    });
  }

  render() {
    let message;
    if (this.state.searching) {
      message = <h3>Searching...</h3>;
    }
    const agencyList = [];
    for (let i = 0; i < this.state.agencies.length; i++) {
      agencyList.push(
        <Agency data={this.state.agencies[i]} key={i} />
      );
    }
    return (
      <div className="results">
        <div id="map"></div>
        <div className="list">
          {message}
          {agencyList}
        </div>
      </div>
    );
  }
}

class Agency extends Component {
  formatDistance(data) {
    let totalDistance = data.distanceFromAddress.reduce(sum);
    return parseFloat(Math.round(metersToMiles(totalDistance) * 100) / 100).toFixed(2);
  }

  render() {
    let data = this.props.data;
    let distance = this.formatDistance(data);
    return (
      <div className="agency">
        <h2>{data.name}</h2>
        <p>{data.formatted_address}</p>
        <p>Sum of distances: {distance} mi</p>
      </div>
    );
  }
}

class App extends Component {
  constructor(props) {
    super(props);

    this.sendPlacesToResults = this.sendPlacesToResults.bind(this);
  }

  sendPlacesToResults(places) {
    console.log("sendPlacesToResults");
    this.results.processPlaces(places);
  }

  render() {
    return (
      <div className="App">
        <div className="App-panel">
          <h1>Real Estate Agency Locator</h1>
          <AddressForm
            numAddresses="2"
            callback={this.sendPlacesToResults}
          />
        </div>
        <div className="content">
          <Results
            ref={(elem) => {
              this.results = elem;
            }}
          />
        </div>
      </div>
    );
  }
}

export default App;
