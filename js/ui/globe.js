/* Skypip — lightweight canvas globe for coarse live-player aggregates. */
(function (S) {
  'use strict';

  function Globe(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  Globe.prototype.render = function (locations) {
    var canvas = this.canvas, ctx = this.ctx;
    var width = Math.max(1, canvas.clientWidth), height = Math.max(1, canvas.clientHeight);
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    var cx = width / 2, cy = height / 2, radius = Math.min(width * 0.3, height * 0.46);
    var centerLongitude = 0;
    for (var c = 0; c < locations.length; c++) {
      if (locations[c].longitude !== null && locations[c].longitude !== undefined &&
          Number.isFinite(Number(locations[c].longitude))) {
        centerLongitude = Number(locations[c].longitude);
        break;
      }
    }
    var gradient = ctx.createRadialGradient(cx - radius * 0.32, cy - radius * 0.38, radius * 0.08, cx, cy, radius * 1.1);
    gradient.addColorStop(0, '#67d8e6');
    gradient.addColorStop(0.65, '#2488b6');
    gradient.addColorStop(1, '#174d78');

    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();

    ctx.strokeStyle = 'rgba(220, 250, 255, 0.25)';
    ctx.lineWidth = 1;
    for (var lat = -60; lat <= 60; lat += 30) {
      ctx.beginPath();
      for (var lon = -90; lon <= 90; lon += 3) {
        var point = project(lat, centerLongitude + lon, cx, cy, radius, centerLongitude);
        if (lon === -90) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      }
      ctx.stroke();
    }
    for (var meridian = -75; meridian <= 75; meridian += 25) {
      ctx.beginPath();
      for (var latitude = -90; latitude <= 90; latitude += 3) {
        var curve = project(latitude, centerLongitude + meridian, cx, cy, radius, centerLongitude);
        if (latitude === -90) ctx.moveTo(curve.x, curve.y);
        else ctx.lineTo(curve.x, curve.y);
      }
      ctx.stroke();
    }

    for (var i = 0; i < locations.length; i++) {
      var location = locations[i];
      if (location.latitude === null || location.latitude === undefined ||
          location.longitude === null || location.longitude === undefined) continue;
      var latValue = Number(location.latitude), lonValue = Number(location.longitude);
      if (!Number.isFinite(latValue) || !Number.isFinite(lonValue)) continue;
      var marker = project(latValue, lonValue, cx, cy, radius, centerLongitude);
      if (marker.depth <= 0) continue;
      var count = Math.max(1, Number(location.players) || 1);
      var dotRadius = Math.min(7, 3.5 + Math.log(count) * 1.2);
      ctx.beginPath();
      ctx.arc(marker.x, marker.y, dotRadius + 3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 225, 125, 0.25)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(marker.x, marker.y, dotRadius, 0, Math.PI * 2);
      ctx.fillStyle = '#ffe27d';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#fff';
      ctx.stroke();
    }

    ctx.restore();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
    ctx.stroke();
  };

  function project(latitude, longitude, cx, cy, radius, centerLongitude) {
    var lat = latitude * Math.PI / 180;
    var delta = (longitude - centerLongitude) * Math.PI / 180;
    var depth = Math.cos(lat) * Math.cos(delta);
    return {
      x: cx + radius * Math.cos(lat) * Math.sin(delta),
      y: cy - radius * Math.sin(lat),
      depth: depth
    };
  }

  S.Globe = Globe;
})(window.Skypip = window.Skypip || {});
