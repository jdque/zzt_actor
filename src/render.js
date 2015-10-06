function Tile(attrs) {
    this.fg = attrs.fg || 0x000000;
    this.bg = attrs.bg || 0x000000;
    this.char = attrs.char || 0;
}

function TilePalette() {
    this.palette = {};
}

TilePalette.prototype.setEntry = function (id, tile) {
    this.palette[id] = tile;
}

TilePalette.prototype.convertToTiles = function (entries) {
    var mapTiles = [];
    for (var i = 0; i < entries.length; i++) {
        mapTiles.push(this.palette[entries[i]]);
    }

    return mapTiles;
}

function TileSprite(cache, name, tiles, width, height) {
    PIXI.Sprite.apply(this, [cache.fetch(name, tiles, width, height)]);

    this.tiles = tiles;
    this.tileWidth = width;
    this.tileHeight = height;
}

TileSprite.prototype = Object.create(PIXI.Sprite.prototype);

TileSprite.prototype.setTiles = function (tiles, width, height) {
    this.tiles = tiles;
    this.tileWidth = width;
    this.tileHeight = height;
}

TileSprite.prototype.getTile = function (tileX, tileY) {
    if (tileX > this.tileWidth - 1 || tileY > this.tileHeight - 1) {
        return null;
    }
    return this.tiles[this.tileWidth * tileY + tileX];
}

TileSprite.prototype.getTilesInRect = function (rect) {
    var tiles = [];
    for (var y = rect.y, endY = rect.y + rect.height; y < endY; y += 8) {
        for (var x = rect.x, endX = rect.x + rect.width; x < endX; x += 8) {
            tiles.push(this.getTile(x / 8, y / 8));
        }
    }

    return tiles;
}

TileSprite.prototype.anyTileInRect = function (rect) {
    for (var y = rect.y, endY = rect.y + rect.height; y < endY; y += 8) {
        for (var x = rect.x, endX = rect.x + rect.width; x < endX; x += 8) {
            var tile = this.getTile(x / 8, y / 8);
            if (tile && tile.char !== 0) {
                return true;
            }
        }
    }

    return false;
}

function TextureCache(canvas) {
    this.baseTexture = PIXI.Texture.fromCanvas(canvas);
    this.canvas = canvas;
    this.cache = {};
    this.binTree = {
        rect: new PIXI.Rectangle(0, 0, this.canvas.width, this.canvas.height),
        used: false,
        left: null,
        right: null
    };
}

TextureCache.prototype.getNextCoord = function (width, height) {
    function traverse(node, depth) {
        if (!node.left && !node.right) { //is leaf
            if (node.used || width > node.rect.width || height > node.rect.height) { //is occupied or doesn't fit
                return null;
            }

            var lRect, llRect, lrRect, rRect;
            if (depth % 2 === 0) { //split along x axis first
                lRect = new PIXI.Rectangle(node.rect.x, node.rect.y, node.rect.width, height);
                llRect = new PIXI.Rectangle(node.rect.x, node.rect.y, width, height);
                lrRect = new PIXI.Rectangle(node.rect.x + width, node.rect.y, node.rect.width - width, height);
                rRect = new PIXI.Rectangle(node.rect.x, node.rect.y + height, node.rect.width, node.rect.height - height);
            }
            else { //split along y axis first
                lRect = new PIXI.Rectangle(node.rect.x, node.rect.y, width, node.rect.height);
                llRect = new PIXI.Rectangle(node.rect.x, node.rect.y, width, height);
                lrRect = new PIXI.Rectangle(node.rect.x, node.rect.y + height, width, node.rect.height - height);
                rRect = new PIXI.Rectangle(node.rect.x + width, node.rect.y, node.rect.width - width, node.rect.height);
            }

            node.left = {
                rect: lRect,
                used: false,
                left: {
                    rect: llRect,
                    used: true,
                    left: null,
                    right: null
                },
                right: {
                    rect: lrRect,
                    used: false,
                    left: null,
                    right: null
                }
            }
            node.right = {
                rect: rRect,
                used: false,
                left: null,
                right: null
            }

            return {x: node.rect.x, y: node.rect.y};
        }
        else { //is branch
            var coord = null;
            coord = traverse(node.left, depth + 1);
            if (coord) {
                return coord;
            }
            coord = traverse(node.right, depth + 1);
            if (coord) {
                return coord;
            }

            return null;
        }
    }

    return traverse(this.binTree, 0);
}

TextureCache.prototype.fetch = function (name, tiles, width, height) {
    if (!this.cache[name]) {
        var coord = this.getNextCoord(8*width, 8*height);
        if (!coord) {
            return null;
        }

        this.drawTiles(tiles, coord.x, coord.y, width, height);
        this.cache[name] = new PIXI.Texture(this.baseTexture, new PIXI.Rectangle(coord.x, coord.y, 8*width, 8*height));
    }
    return this.cache[name];
}

TextureCache.prototype.drawTiles = function (tiles, x, y, width, height) {
    var ctx = this.canvas.getContext('2d');
    for (var iy = 0; iy < height; iy++) {
        for (var ix = 0; ix < width; ix++) {
            var tile = tiles[(ix * width) + iy];
            var destX = x + ix * 8;
            var destY = y + iy * 8;

            ctx.drawImage(
                TILESET,
                (tile.char % 16) * 8, Math.floor(tile.char / 16) * 8,
                8, 8,
                destX, destY,
                8, 8);

            //Tint white and black pixels with tile's foreground and background color, respectively
            var fgRgb = {r: (tile.fg >> 16) & 0xFF, g: (tile.fg >> 8) & 0xFF, b: tile.fg & 0xFF};
            var bgRgb = {r: (tile.bg >> 16) & 0xFF, g: (tile.bg >> 8) & 0xFF, b: tile.bg & 0xFF};
            var imageData = ctx.getImageData(destX, destY, 8, 8);
            var pixels = imageData.data;
            for (var i = 0; i < pixels.length; i += 4) {
                if (pixels[i] > 0 && pixels[i+1] > 0 && pixels[i+2] > 0) {
                    pixels[i] = fgRgb.r;
                    pixels[i+1] = fgRgb.g;
                    pixels[i+2] = fgRgb.b;
                }
                else {
                    pixels[i] = bgRgb.r;
                    pixels[i+1] = bgRgb.g;
                    pixels[i+2] = bgRgb.b;
                }
            }
            ctx.putImageData(imageData, destX, destY);
        }
    }
}

function GridHash(cellSize) {
    this.cellSize = cellSize || 64;
    this.cells = {};
    this.objIdCellMap = {};
    this.bounds = {min: new PIXI.Point(0, 0), max: new PIXI.Point(0, 0)};
}

GridHash.prototype.getKey = function (x, y) {
    var cellX = Math.floor(x / this.cellSize);
    var cellY = Math.floor(y / this.cellSize);
    return cellX + "," + cellY;
}

GridHash.prototype.addObject = function (object) {
    if (this.objIdCellMap[object.id]) {
        return;
    }

    this.objIdCellMap[object.id] = [];

    var bounds = object.body.bounds;

    //Insert corner points
    this.addObjectForPoint(object, bounds.x, bounds.y);
    this.addObjectForPoint(object, bounds.x + bounds.width, bounds.y);
    this.addObjectForPoint(object, bounds.x, bounds.y + bounds.height);
    this.addObjectForPoint(object, bounds.x + bounds.width, bounds.y + bounds.height);

    //Insert intermediate points, spaced by cell size
    for (var y = bounds.y + this.cellSize, endY = bounds.y + bounds.height; y < endY; y += this.cellSize) {
        for (var x = bounds.x + this.cellSize, endX = bounds.x + bounds.width; x < endX; x += this.cellSize) {
            this.addObjectForPoint(x, y, object);
        }
    }

    //Update global bounds
    if (bounds.x < this.bounds.min.x) this.bounds.min.x = bounds.x;
    if (bounds.y < this.bounds.min.y) this.bounds.min.y = bounds.y;
    if (bounds.x + bounds.width > this.bounds.max.x) this.bounds.max.x = bounds.x + bounds.width;
    if (bounds.y + bounds.height > this.bounds.max.y) this.bounds.max.y = bounds.y + bounds.height;
}

GridHash.prototype.removeObject = function (object) {
    if (!this.objIdCellMap[object.id]) {
        return;
    }

    for (var i = 0; i < this.objIdCellMap[object.id].length; i++) {
        var cell = this.cells[this.objIdCellMap[object.id][i]];
        cell[cell.indexOf(object)] = cell[cell.length - 1];
        cell.pop();
    }
    this.objIdCellMap[object.id] = null;
}

GridHash.prototype.updateObject = function (object) {
    if (!this.objIdCellMap[object.id]) {
        return;
    }

    var bounds = object.body.bounds;

    //If object corner points are in the same cells as before, no need to update
    if (this.objIdCellMap[object.id].indexOf(this.getKey(bounds.x, bounds.y)) > -1 &&
        this.objIdCellMap[object.id].indexOf(this.getKey(bounds.x + bounds.width, bounds.y)) > -1 &&
        this.objIdCellMap[object.id].indexOf(this.getKey(bounds.x, bounds.y + bounds.height)) > -1 &&
        this.objIdCellMap[object.id].indexOf(this.getKey(bounds.x + bounds.width, bounds.y + bounds.height)) > -1) {
        return;
    }

    this.removeObject(object);
    this.addObject(object);
}

GridHash.prototype.addObjectForPoint = function (object, x, y) {
    var key = this.getKey(x, y);

    if (!this.cells[key]) {
        this.cells[key] = [];
    }

    if (this.cells[key].indexOf(object) === -1) {
        this.cells[key].push(object);
        this.objIdCellMap[object.id].push(key);
    }
}

GridHash.prototype.getNearbyObjects = function (x, y, w, h) {
    var objects = [];

    var cellX = Math.floor(x / this.cellSize) - 1;
    var cellY = Math.floor(y / this.cellSize) - 1;
    var cellW = Math.ceil(w / this.cellSize) + 1;
    var cellH = Math.ceil(h / this.cellSize) + 1;
    for (var y = cellY; y <= cellY + cellH; y++) {
        for (var x = cellX; x <= cellX + cellW; x++) {
            var cellObjs = this.getCellObjects(x + "," + y);
            for (var i = 0; i < cellObjs.length; i++) {
                if (objects.indexOf(cellObjs[i]) === -1) {
                    objects.push(cellObjs[i]);
                }
            }
        }
    }

    return objects;
}

GridHash.prototype.getBounds = function () {
    return this.bounds;
}

GridHash.prototype.getCellObjects = function (key) {
    return this.cells[key] || [];
}

GridHash.prototype.getCellObjectsForPoint = function (x, y) {
    var key = this.getKey(x, y);
    return this.cells[key] || [];
}

function Spatial(finder) {
    this.finder = finder;
    this.objects = [];
}

Spatial.prototype.register = function (object) {
    if (this.objects.indexOf(object) !== -1) {
        return;
    }
    this.objects.push(object);
    this.finder.addObject(object);
}

Spatial.prototype.unregister = function (object) {
    var idx = this.objects.indexOf(object);
    if (idx === -1) {
        return;
    }
    this.objects[idx] = this.objects[this.objects.length - 1];
    this.objects.pop();
    this.finder.removeObject(object);
}

Spatial.prototype.update = function (object) {
    this.finder.updateObject(object);
}

Spatial.prototype.isIntersect = function (rect1, rect2) {
    if (rect1.x + rect1.width > rect2.x &&
        rect1.x < rect2.x + rect2.width &&
        rect1.y + rect1.height > rect2.y &&
        rect1.y < rect2.y + rect2.height) {
        return true;
    }

    return false;
}

Spatial.prototype.isInside = function (testRect, inRect) {
    if (testRect.x >= inRect.x &&
        testRect.y >= inRect.y &&
        testRect.x + testRect.width <= inRect.x + inRect.width &&
        testRect.y + testRect.height <= inRect.y + inRect.height) {
        return true;
    }

    return false;
}

Spatial.prototype.isWithin = function (testRect, fromRect, distance) {
    if (this.isIntersect(testRect, fromRect)) {
        return true;
    }

    var fromX = 0;
    var fromY = 0;
    var testX = 0;
    var testY = 0;

    if (fromRect.x + fromRect.width < testRect.x) {
        fromX = fromRect.x + fromRect.width;
    }
    else if (testRect.x + testRect.width < fromRect.x) {
        testX = testRect.x + testRect.width
    }

    if (fromRect.y + fromRect.height < testRect.y) {
        fromY = fromRect.y + fromRect.height;
    }
    else if (testRect.y + testRect.height < fromRect.y) {
        testY = testRect.y + testRect.height;
    }

    if (Math.sqrt(Math.pow(fromX - testX, 2) + Math.pow(fromY - testY, 2)) <= distance) {
        return true;
    }

    return false;
}

Spatial.prototype.isDirection = function (testRect, fromRect, dirX, dirY) {
    if (dirX === -1 && testRect.x + testRect.width > fromRect.x) return false;
    if (dirX === 1 && testRect.x < fromRect.x + fromRect.width) return false;
    if (dirY === -1 && testRect.y + testRect.height > fromRect.y) return false;
    if (dirY === 1 && testRect.y < fromRect.y + fromRect.height) return false;

    return true;
}

Spatial.prototype.getAll = function () {
    return this.objects;
}

Spatial.prototype.getIntersect = function (rect, offsetX, offsetY) {
    rect.x += offsetX || 0;
    rect.y += offsetY || 0;

    var objs = this.finder.getNearbyObjects(rect.x, rect.y, rect.width, rect.height);
    for (var i = objs.length - 1; i >= 0; i--) {
        if (!this.isIntersect(objs[i].body.bounds, rect)) {
            objs[i] = objs[objs.length - 1];
            objs.pop();
        }
    }

    rect.x -= offsetX || 0;
    rect.y -= offsetY || 0;

    return objs;
}

Spatial.prototype.getInside = function (rect, offsetX, offsetY) {
    rect.x += offsetX || 0;
    rect.y += offsetY || 0;

    var objs = this.finder.getNearbyObjects(rect.x, rect.y, rect.width, rect.height);
    for (var i = objs.length - 1; i >= 0; i--) {
        if (!this.isInside(objs[i].body.bounds, rect)) {
            objs[i] = objs[objs.length - 1];
            objs.pop();
        }
    }

    rect.x -= offsetX || 0;
    rect.y -= offsetY || 0;

    return objs;
}

Spatial.prototype.getWithin = function (rect, distance) {
    var objs = this.finder.getNearbyObjects(rect.x - distance, rect.y - distance, rect.width + distance * 2, rect.height + distance * 2);
    for (var i = objs.length - 1; i >= 0; i--) {
        if (!this.isWithin(objs[i].body.bounds, rect, distance)) {
            objs[i] = objs[objs.length - 1];
            objs.pop();
        }
    }

    return objs;
}

Spatial.prototype.getDirection = function (rect, dirX, dirY) {
    var queryRect = new PIXI.Rectangle(0, 0, 0, 0);
    var bounds = this.finder.getBounds();
    if (dirX === -1) {
        queryRect.x = bounds.min.x;
        queryRect.width = rect.x - bounds.min.x;
    }
    else if (dirX === 1) {
        queryRect.x = rect.x + rect.width;
        queryRect.width = bounds.max.x - queryRect.x;
    }
    else {
        queryRect.x = bounds.min.x;
        queryRect.width = bounds.max.x - bounds.min.x;
    }

    if (dirY === -1) {
        queryRect.y = bounds.min.y;
        queryRect.height = rect.y - bounds.min.y;
    }
    else if (dirY === 1) {
        queryRect.y = rect.y + rect.height;
        queryRect.height = bounds.max.y - queryRect.y;
    }
    else {
        queryRect.y = bounds.min.y;
        queryRect.height = bounds.max.y - bounds.min.y;
    }

    return this.getInside(queryRect, 0, 0);
}

Spatial.prototype.query = function () {
    return (function (spatial) {
        var resultSet = null;
        var notIsActive = false;

        function listDiff(list, removeList) {
            var diffList = []
            for (var i = 0; i < list.length; i++) {
                if (removeList.indexOf(list[i]) === -1) {
                    diffList.push(list[i]);
                }
            }

            return diffList;
        }

        function all() {
            if (!resultSet) {
                if (notIsActive) {
                    resultSet = [];
                }
                else {
                    resultSet = spatial.getAll();
                }
            }

            notIsActive = false;
            return closure;
        }

        function intersect(rect, offsetX, offsetY) {
            if (!resultSet) {
                if (notIsActive) {
                    resultSet = listDiff(spatial.getAll(), spatial.getIntersect(rect, offsetX, offsetY));
                }
                else {
                    resultSet = spatial.getIntersect(rect, offsetX, offsetY);
                }
            }
            else {
                resultSet = resultSet.filter(function (obj) {
                    return spatial.isIntersect(obj.body.bounds, rect) !== notIsActive;
                });
            }

            notIsActive = false;
            return closure;
        }

        function inside(rect, offsetX, offsetY) {
            if (!resultSet) {
                if (notIsActive) {
                    resultSet = listDiff(spatial.getAll(), spatial.getInside(rect, offsetX, offsetY));
                }
                else {
                    resultSet = spatial.getInside(rect, offsetX, offsetY);
                }
            }
            else {
                resultSet = resultSet.filter(function (obj) {
                    return spatial.isInside(obj.body.bounds, rect) !== notIsActive;
                });
            }

            notIsActive = false;
            return closure;
        }

        function distance(fromRect, distance) {
            if (!resultSet) {
                if (notIsActive) {
                    resultSet = listDiff(spatial.getAll(), spatial.getWithin(fromRect, distance));
                }
                else {
                    resultSet = spatial.getWithin(fromRect, distance);
                }
            }
            else {
                resultSet = resultSet.filter(function (obj) {
                    return spatial.isWithin(obj.body.bounds, fromRect, distance) !== notIsActive;
                });
            }

            notIsActive = false;
            return closure;
        }

        function direction(fromRect, dirX, dirY) {
            if (!resultSet) {
                if (notIsActive) {
                    resultSet = listDiff(spatial.getAll(), spatial.getDirection(fromRect, dirX, dirY));
                }
                else {
                    resultSet = spatial.getDirection(fromRect, dirX, dirY);
                }
            }
            else {
                resultSet = resultSet.filter(function (obj) {
                    return spatial.isDirection(obj.body.bounds, fromRect, dirX, dirY) !== notIsActive;
                });
            }

            notIsActive = false;
            return closure;
        }

        function not() {
            notIsActive = !notIsActive;
            return closure;
        }

        function get() {
            return resultSet;
        }

        var closure = {
            all: all,
            intersect: intersect,
            inside: inside,
            distance: distance,
            direction: direction,
            not: not,
            get: get
        }

        return closure;
    })(this);
}

var WIDTH = 640;
var HEIGHT = 480;
var stage = new PIXI.Stage(0x000000);
var renderer = new PIXI.CanvasRenderer(WIDTH, HEIGHT);
var TILESET = null;
var cacheCanvas = null;
var textureCache = null;

var tilePalette = null;
var tileMap = null;
var tileMapCanvas = null;
var tileMapCache = null;

function update() {
    window.board.step();

    window.renderer.render(stage);

    requestAnimFrame(update);
}

function testTexturePacking() {
    for (var i = 0; i < 100; i++) {
        var w = Math.floor(Math.random() * 30);
        var h = Math.floor(Math.random() * 30);
        var tile = Math.floor(Math.random() * 128);
        var tiles = [];
        for (var j = 0; j < w * h; j++) {
            tiles.push(tile);
        }
        var tex = textureCache.fetch(i.toString(), tiles, w, h);
        if (!tex) console.log("couldnt fit")
    }
}

function initialize() {
    TILESET = document.createElement('img');
    TILESET.onload = run;
    TILESET.src = 'assets/tileset.bmp';
}

function run() {
    document.body.appendChild(renderer.view);

    cacheCanvas = document.createElement('canvas');
    cacheCanvas.width = 640;
    cacheCanvas.height = 960;

    textureCache = new TextureCache(cacheCanvas);

    tilePalette = new TilePalette();
    tilePalette.setEntry(0, new Tile({fg: 0x000000, bg: 0x000000, char: 0}));
    tilePalette.setEntry(1, new Tile({fg: 0xFF0000, bg: 0x00FF00, char: 100}));
    tilePalette.setEntry(2, new Tile({fg: 0xFF0000, bg: 0x000000, char: 219}));
    tilePalette.setEntry(3, new Tile({fg: 0x0000FF, bg: 0x000000, char: 219}));
    tilePalette.setEntry(4, new Tile({fg: 0xFFFFFF, bg: 0x000000, char: 7}));

    tileMapCanvas = document.createElement('canvas');
    tileMapCanvas.width = 640;
    tileMapCanvas.height = 480;
    tileMapCanvas.style.backgroundColor = 0x000000;
    document.body.appendChild(tileMapCanvas);

    tileMapCache = new TextureCache(tileMapCanvas);

    var tiles = tilePalette.convertToTiles(
      [1, 1, 1, 1, 1,
       1, 0, 0, 0, 1,
       1, 0, 0, 0, 1,
       1, 0, 0, 0, 1,
       1, 1, 1, 1, 1]);
    tileMap = new TileSprite(tileMapCache, "map", tiles, 5, 5);
    tileMap.position.x = 0;
    tileMap.position.y = 0;
    window.stage.addChild(tileMap);

    window.spatial = new Spatial(new GridHash(32));

    window.sprites = {
        player: {
            tiles: tilePalette.convertToTiles(
                [3, 3,
                 3, 3]),
            width: 2, height: 2,
            x: 320, y: 240
        },
        enemy: {
            tiles: tilePalette.convertToTiles(
                [2, 2, 2,
                 2, 2, 2,
                 2, 2, 2]),
            width: 3, height: 3,
            x: 0, y: 0
        },
        bullet: {
            tiles: tilePalette.convertToTiles([4]),
            width: 1, height: 1,
            x: 0, y: 0
        }
    }

    RenderParser = new Parser();
    RenderParser.registerModule('default', DefaultCommandSet);
    RenderParser.registerModule('html', DOMCommandSet);
    RenderParser.registerModule('pixi', PIXICommandSet);
    RenderParser.registerModule('body', PhysicsCommandSet);
    RenderParser.registerModule('input', InputCommandSet);

    window.board = new Board();
    board.configure({
        autoStep: false,
        parser: RenderParser
    });
    board.setup(function () {
        object('Player', ['@x', '@y'], function () {
            adopt('body', { bounds: new PIXI.Rectangle(0, 0, 16, 16), spatial: spatial})
            adopt('pixi', sprites.player)
            adopt('input')
            body.move_to(val('@x'), val('@y'))
            jump('move')
            end()

            label('move')
                _if(input.key_down(38))
                    body.move('/n')
                _elif(input.key_down(40))
                    body.move('/s')
                _endif()

                _if(input.key_down(37))
                    body.move('/w')
                _elif(input.key_down(39))
                    body.move('/e')
                _endif()

                _if(input.key_down(32))
                    send('[parent]', 'shoot', [expr('this.body.bounds.x + this.body.bounds.width'), expr('this.body.bounds.y'), "e"])
                    wait(5)
                _endif()

                _if(body.blocked('flow'))
                    body.move('/i')
                _endif()

                wait(1)
                jump('move')
            end()
        });

        object('Enemy', ['@x', '@y'], function () {
            adopt('body', { bounds: new PIXI.Rectangle(0, 0, 24, 24), spatial: spatial})
            adopt('pixi', sprites.enemy)
            body.move_to(val('@x'), val('@y'))
            pixi.alpha(0.5)
            jump('move')
            end()

            label('move')
                body.move('/rnd')
                jump('move')
            end()

            label('enemy_stop')
                print("OUCH")
            die()
        });

        object('Bullet', ['@x', '@y', '@dir'], function () {
            adopt('body', { bounds: new PIXI.Rectangle(0, 0, 8, 8), spatial: spatial})
            adopt('pixi', sprites.bullet)
            body.move_to(val('@x'), val('@y'))
            _if('@dir === "e"')
                body.move('/e')
            _endif()
            jump('loop')

            label('loop')
                _if(body.blocked('flow'))
                    send(body.dir('flow'), 'enemy_stop')
                    jump('stop')
                _endif()
                body.move('/flow')
                jump('loop')
            end()

            label('stop')
            die()
        })
    });
    board.run(function () {
        loop(100)
            spawn('Enemy', [expr('Math.floor(Math.random() * 640 / 8) * 8'), expr('Math.floor(Math.random() * 480 / 8) * 8')])
        endloop()
        spawn('Player', [640 / 2, 480 / 2])
        end()

        label('shoot', ['@x', '@y', '@dir'])
            spawn('Bullet', [val('@x'), val('@y'), val('@dir')])
        end()
    });
    board.execute();

    requestAnimFrame(update);
}

window.onload = initialize;