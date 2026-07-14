from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import models
import schemas
from database import get_db

router = APIRouter(prefix="/api", tags=["inventory"])


def _next_sku(db: Session) -> str:
    count = db.query(models.Item).count()
    candidate = count + 1
    existing = {i.sku for i in db.query(models.Item).all()}
    while f"ITM-{candidate:04d}" in existing:
        candidate += 1
    return f"ITM-{candidate:04d}"


def _stock_on_hand(db: Session, item_id: int) -> float:
    movements = db.query(models.StockMovement).filter(models.StockMovement.item_id == item_id).all()
    return round(sum(m.quantity for m in movements), 3)


def _serialize_item(db: Session, item: models.Item) -> dict:
    on_hand = _stock_on_hand(db, item.id) if item.is_stock_tracked else 0.0
    return {
        "id": item.id,
        "sku": item.sku,
        "name": item.name,
        "category": item.category,
        "unit": item.unit,
        "sale_price": item.sale_price,
        "purchase_price": item.purchase_price,
        "reorder_point": item.reorder_point,
        "is_stock_tracked": item.is_stock_tracked,
        "is_active": item.is_active,
        "stock_on_hand": on_hand,
        "stock_value": round(on_hand * item.purchase_price, 2),
        "below_reorder_point": item.is_stock_tracked and on_hand <= item.reorder_point,
    }


@router.get("/items", response_model=list[schemas.ItemOut])
def list_items(include_inactive: bool = False, db: Session = Depends(get_db)):
    q = db.query(models.Item)
    if not include_inactive:
        q = q.filter(models.Item.is_active.is_(True))
    items = q.order_by(models.Item.name).all()
    return [_serialize_item(db, i) for i in items]


@router.post("/items", response_model=schemas.ItemOut)
def create_item(payload: schemas.ItemIn, db: Session = Depends(get_db)):
    sku = payload.sku or _next_sku(db)
    if db.query(models.Item).filter(models.Item.sku == sku).first():
        raise HTTPException(400, f"SKU '{sku}' is already in use")
    item = models.Item(**payload.model_dump(exclude={"sku"}), sku=sku, is_active=True)
    db.add(item)
    db.commit()
    db.refresh(item)
    return _serialize_item(db, item)


@router.put("/items/{item_id}", response_model=schemas.ItemOut)
def update_item(item_id: int, payload: schemas.ItemIn, db: Session = Depends(get_db)):
    item = db.query(models.Item).get(item_id)
    if not item:
        raise HTTPException(404, "Item not found")
    for field, value in payload.model_dump(exclude={"sku"}).items():
        setattr(item, field, value)
    if payload.sku:
        item.sku = payload.sku
    db.commit()
    db.refresh(item)
    return _serialize_item(db, item)


@router.post("/items/{item_id}/deactivate")
def deactivate_item(item_id: int, db: Session = Depends(get_db)):
    item = db.query(models.Item).get(item_id)
    if not item:
        raise HTTPException(404, "Item not found")
    item.is_active = False
    db.commit()
    return {"ok": True}


@router.post("/items/{item_id}/activate")
def activate_item(item_id: int, db: Session = Depends(get_db)):
    item = db.query(models.Item).get(item_id)
    if not item:
        raise HTTPException(404, "Item not found")
    item.is_active = True
    db.commit()
    return {"ok": True}


@router.delete("/items/{item_id}")
def delete_item(item_id: int, db: Session = Depends(get_db)):
    item = db.query(models.Item).get(item_id)
    if not item:
        raise HTTPException(404, "Item not found")
    if item.movements:
        raise HTTPException(400, "Cannot delete an item with stock movements — deactivate it instead")
    db.delete(item)
    db.commit()
    return {"ok": True}


@router.get("/items/{item_id}/movements", response_model=list[schemas.StockMovementOut])
def list_movements(item_id: int, db: Session = Depends(get_db)):
    item = db.query(models.Item).get(item_id)
    if not item:
        raise HTTPException(404, "Item not found")
    movements = (
        db.query(models.StockMovement)
        .filter(models.StockMovement.item_id == item_id)
        .order_by(models.StockMovement.date, models.StockMovement.id)
        .all()
    )
    rows = []
    balance = 0.0
    for m in movements:
        balance = round(balance + m.quantity, 3)
        rows.append(
            {
                "id": m.id, "item_id": m.item_id, "date": m.date, "movement_type": m.movement_type,
                "quantity": m.quantity, "unit_cost": m.unit_cost, "reference": m.reference,
                "notes": m.notes, "running_balance": balance,
            }
        )
    rows.reverse()
    return rows


@router.post("/items/{item_id}/movements", response_model=schemas.StockMovementOut)
def add_movement(item_id: int, payload: schemas.StockMovementIn, db: Session = Depends(get_db)):
    item = db.query(models.Item).get(item_id)
    if not item:
        raise HTTPException(404, "Item not found")
    movement = models.StockMovement(item_id=item_id, **payload.model_dump())
    db.add(movement)
    db.commit()
    db.refresh(movement)
    return {**payload.model_dump(), "id": movement.id, "item_id": item_id, "running_balance": _stock_on_hand(db, item_id)}


@router.get("/inventory/stock-register")
def stock_register(db: Session = Depends(get_db)):
    items = db.query(models.Item).filter(models.Item.is_active.is_(True), models.Item.is_stock_tracked.is_(True)).order_by(models.Item.name).all()
    rows = [_serialize_item(db, i) for i in items]
    return {
        "rows": rows,
        "total_stock_value": round(sum(r["stock_value"] for r in rows), 2),
        "below_reorder_count": sum(1 for r in rows if r["below_reorder_point"]),
    }
