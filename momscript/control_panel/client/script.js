'use strict';

let container, stats;
let stageGui, connectionGui;
let camera, scene, renderer;
let topDirectionalLight, leftDirectionalLight, rightDirectionalLight;
let mesh, lines, geometry;
let tool;
let programText;
let clock;
let mixers = [];
let EPSILON = 0.001;

THREE.Vector3.prototype.approxEqual = function(v) {
    return Math.abs(v.x - this.x) <= EPSILON
           && Math.abs(v.y - this.y) <= EPSILON
           && Math.abs(v.z- this.z) <= EPSILON
};

/* SCENE INITIALIZATION */

let initCamera = () => {
    let aspect = window.innerWidth / window.innerHeight;
    let viewSize = 150;
    camera = new THREE.OrthographicCamera(-viewSize * aspect, viewSize * aspect,
        viewSize, -viewSize, -1000, 10000);
    camera.zoom = 1.5;
    camera.updateProjectionMatrix();
    camera.frustumCulled = false;
    camera.position.set(-500, 500, 500); // I don't know why this works
    camera.lookAt(scene.position);
    // camera.position.set(-400, 500, 800); // Pan away to move machine to left
};

let initScene = () => {
    scene = new THREE.Scene();
    clock = new THREE.Clock();
    scene.background = new THREE.Color(0x000000);
    topDirectionalLight = new THREE.DirectionalLight( 0xffffff, 1.00 );
    leftDirectionalLight = new THREE.DirectionalLight( 0xffffff, 0.75 );
    rightDirectionalLight = new THREE.DirectionalLight( 0xffffff, 0.50 );
    leftDirectionalLight.position.set(-1.0, 0.0, 0.0);
    rightDirectionalLight.position.set(0.0, 0.0, 1.0);
    scene.add(topDirectionalLight);
    scene.add(leftDirectionalLight);
    scene.add(rightDirectionalLight);
    scene.add(new THREE.GridHelper(2000, 50, 0xe5e6e8, 0x444444));
};

let initRenderer = () => {
    renderer = new THREE.WebGLRenderer( { antialias: true } );
    renderer.setPixelRatio( window.devicePixelRatio );
    renderer.setSize( window.innerWidth, window.innerHeight );
    container.appendChild( renderer.domElement );
};

let initStats = () => {
    stats = new Stats();
    container.appendChild( stats.dom );
};

let init = () => {
    container = document.getElementById( 'container' );

    initScene();
    initCamera();
    initRenderer();
    //initStats();

    window.addEventListener( 'resize', onWindowResize, false );
};

let onWindowResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    renderer.setSize( window.innerWidth, window.innerHeight );
};

let cappedFramerateRequestAnimationFrame = (framerate) => {
    if (framerate === undefined) {
        requestAnimationFrame(animate);
    } else {
        setTimeout(() => {
            requestAnimationFrame(animate);
        }, 1000 / framerate);
    }
};

/* MESH STUFF */

let loadStl = (filepath) => {
    let promise = makeLoadStlPromise(filepath);
    return addStlFromPromise(promise);
};

let makeLoadStlPromise = (filepath) => {
    let loadPromise = new Promise(resolve => {
        let loader = new THREE.STLLoader();
        let stlMesh;
        return loader.load(filepath, (stlGeom) => {
            let meshMaterial = new THREE.MeshBasicMaterial({
                color: 0xffffff,
                wireframe: true
            });
            stlMesh = new THREE.Mesh(stlGeom, meshMaterial);
            stlMesh.isLoadedStl = true;
            resolve(stlMesh);
        }, undefined, (errorMsg) => {
            console.log(errorMsg);
        });
    });
    return loadPromise;
};

let addStlFromPromise = (promise) => {
   return promise.then((mesh) => {
       scene.add(mesh);
   });
};

let getStlMeshes = () => {
    return scene.children.filter((child) => {
        return child.isLoadedStl;
    });
};

let meshToGeometry = (mesh) => {
    return new THREE.Geometry().fromBufferGeometry(mesh.geometry);
};

let test = () => {
    loadStl('assets/pikachu.stl').then(() => {
        // NOTE: we have to assign promise values to global variables
        mesh = getStlMeshes()[0];
        geometry = meshToGeometry(mesh);
    });
};

let sliceMesh = (mesh, nonBufferGeometry, layerHeight) => {
    /* Returns intersection point, or undefined if no intersection */
    let segmentPlaneIntersect = (v0, v1, plane) => {
        let v0_dist_to_plane = plane.distanceToPoint(v0);
        let v1_dist_to_plane = plane.distanceToPoint(v1);
        if (v0_dist_to_plane * v1_dist_to_plane < 0) {
            // NOTE: isect = v0 + t * (v1 - v0)
            let t = v0_dist_to_plane / (v0_dist_to_plane - v1_dist_to_plane);
            let isect = new THREE.Vector3().copy(v0);
            let rest = new THREE.Vector3().copy(v1).sub(v0).multiplyScalar(t);
            return isect.add(rest);
        }
    };
    let calcSegmentsForPlane = (plane) => {
        let isectSegments = [];
        nonBufferGeometry.faces.forEach((face) => {
            let v0 = mesh.localToWorld(nonBufferGeometry.vertices[face.a]);
            let v1 = mesh.localToWorld(nonBufferGeometry.vertices[face.b]);
            let v2 = mesh.localToWorld(nonBufferGeometry.vertices[face.c]);
            let isect01 = segmentPlaneIntersect(v0, v1, xzPlane);
            let isect12 = segmentPlaneIntersect(v1, v2, xzPlane);
            let isect20 = segmentPlaneIntersect(v2, v0, xzPlane);
            if (isect01 !== undefined && isect12 !== undefined) {
                isectSegments.push([isect01, isect12])
            }
            if (isect01 !== undefined && isect20 !== undefined) {
                isectSegments.push([isect01, isect20])
            }
            if (isect12 !== undefined && isect20 !== undefined) {
                isectSegments.push([isect12, isect20])
            }
        });
        return isectSegments;
    };
    let calcContoursForLayerSegment = (segments, segIdx) => {
        if (segments.length === 0) {
            return [];
        }
        let contours = [];
        // NOTE: define a contour as an ordered list of points
        let currContour = [];
        let unvisitedSegments = segments.slice();
        let currSegment = unvisitedSegments[0];
        let pointToPush = currSegment[0];
        let pointForFindingNextSeg = currSegment[1];
        while (unvisitedSegments.length > 0) {
            currContour.push(pointToPush);
            unvisitedSegments.splice(unvisitedSegments.indexOf(currSegment), 1);
            let foundNextSegment = unvisitedSegments.some((potentialSegment) => {
                if (potentialSegment[0].approxEqual(pointForFindingNextSeg)) {
                    currSegment = potentialSegment;
                    pointToPush = potentialSegment[0];
                    pointForFindingNextSeg = potentialSegment[1];
                    return true;
                }
                if (potentialSegment[1].approxEqual(pointForFindingNextSeg)) {
                    currSegment = potentialSegment;
                    pointToPush = potentialSegment[1];
                    pointForFindingNextSeg = potentialSegment[0];
                    return true;
                }
            });
            if (!foundNextSegment) {
                contours.push(currContour.slice());
                currContour = [];
                if (unvisitedSegments.length > 0) {
                    currSegment = unvisitedSegments[0];
                    pointToPush = currSegment[0];
                    pointForFindingNextSeg = currSegment[1];
                }
            }
        }
        return contours;
    };
    geometry.computeBoundingBox();
    let planeHeight = geometry.boundingBox.min.y;
    let maxHeight = geometry.boundingBox.max.y;
    let xzPlane, segments, layerContours;
    let contoursPerLayer = [];
    while (planeHeight <= maxHeight) {
        // NOTE: constant should be negative because plane -> origin distance
        // is downward
        xzPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeHeight);
        segments = calcSegmentsForPlane(xzPlane);
        layerContours = calcContoursForLayerSegment(segments);
        contoursPerLayer.push(layerContours);
        planeHeight += layerHeight;
    }
    return contoursPerLayer;
};

let visualizePoints = (isectPts) => {
    let pointsMaterial = new THREE.PointsMaterial({
        size: 5.0,
        color: 0xEA2027
    });
    let pointsGeom = new THREE.Geometry();
    pointsGeom.vertices = isectPts;
    let pointsObj = new THREE.Points(pointsGeom, pointsMaterial);
    scene.add(pointsObj);
    return pointsObj;
};

/* SCENE RENDERING MAIN FUNCTIONS */

let animate = () => {
    cappedFramerateRequestAnimationFrame(30);
    render();
    // stats.update();
};

let render = () => {
    let deltaSeconds = clock.getDelta();
    mixers.forEach((mixer) => {
        mixer.update(deltaSeconds);
    });
    renderer.render( scene, camera );
};

init();
animate();
